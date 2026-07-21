# EKS Full-Stack Deployment with Jenkins CI/CD

A minimal but complete, real-world pipeline:

```
Developer pushes code
        │
        ▼
   Jenkins pipeline (Jenkinsfile)
        │  1. checkout  2. test  3. docker build
        │  4. push images to ECR  5. kubectl apply to EKS
        ▼
   Amazon EKS cluster
   ┌───────────────────────────────┐
   │  frontend (nginx, 2 pods)     │  <-- LoadBalancer (public)
   │      │ proxies /api/*        │
   │      ▼                       │
   │  backend (Node/Express, 2)   │  <-- ClusterIP (internal only)
   └───────────────────────────────┘
```

## Project structure

```
eks-fullstack-jenkins/
├── backend/                 Node.js/Express Task API
│   ├── server.js
│   ├── package.json
│   ├── Dockerfile
│   └── .dockerignore
├── frontend/                Plain HTML/CSS/JS UI, served by nginx
│   ├── index.html
│   ├── style.css
│   ├── app.js
│   ├── nginx.conf           reverse-proxies /api/ to the backend Service
│   └── Dockerfile
├── k8s/                     Kubernetes manifests (plain YAML, kubectl apply)
│   ├── namespace.yaml
│   ├── configmap.yaml
│   ├── backend-deployment.yaml
│   ├── backend-service.yaml
│   ├── frontend-deployment.yaml
│   └── frontend-service.yaml
├── eks/
│   └── cluster-config.yaml  eksctl config to create the EKS cluster
├── Jenkinsfile               the CI/CD pipeline itself
├── docker-compose.yml        optional local testing
└── README.md
```

The demo app is a small **Task Board**: the frontend calls `/api/tasks` on the
backend to list, add, complete, and delete tasks. It's intentionally simple so
the DevOps pipeline — the actual point of this project — stays the focus.

---

## Step 1 — Install tooling (once, on your machine or the Jenkins host)

```bash
# AWS CLI v2
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip && sudo ./aws/install
aws configure                      # enter your AWS Access Key, Secret, region

# eksctl (creates/manages EKS clusters)
curl --silent --location "https://github.com/eksctl-io/eksctl/releases/latest/download/eksctl_Linux_amd64.tar.gz" | tar xz -C /tmp
sudo mv /tmp/eksctl /usr/local/bin

# kubectl
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
sudo install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl

# Docker
sudo apt-get update && sudo apt-get install -y docker.io
sudo usermod -aG docker $USER   # log out/in after this
```

## Step 2 — Create the EKS cluster

```bash
eksctl create cluster -f eks/cluster-config.yaml
```

This provisions (takes ~15-20 minutes):
- A VPC, subnets, and security groups
- The EKS control plane
- A managed node group of 2 `t3.medium` EC2 worker nodes
- An OIDC provider (used later if you add IAM roles for service accounts)

Verify:
```bash
kubectl get nodes
```

## Step 3 — Create the ECR repositories (optional — Jenkins also creates them automatically)

```bash
aws ecr create-repository --repository-name eks-demo-backend  --region us-east-1
aws ecr create-repository --repository-name eks-demo-frontend --region us-east-1
```

## Step 4 — Install and configure Jenkins

You can run Jenkins on an EC2 instance (in or near the same VPC as EKS) or
anywhere with network access to AWS.

```bash
# On an Ubuntu EC2 instance:
sudo apt update
sudo apt install -y openjdk-17-jre
curl -fsSL https://pkg.jenkins.io/debian-stable/jenkins.io-2023.key | sudo tee \
  /usr/share/keyrings/jenkins-keyring.asc > /dev/null
echo deb [signed-by=/usr/share/keyrings/jenkins-keyring.asc] \
  https://pkg.jenkins.io/debian-stable binary/ | sudo tee \
  /etc/apt/sources.list.d/jenkins.list > /dev/null
sudo apt update
sudo apt install -y jenkins
sudo systemctl enable --now jenkins
```

Then, **on the same host** install the tools the pipeline needs (docker,
aws-cli, kubectl — same commands as Step 1), and add the `jenkins` user to
the `docker` group:
```bash
sudo usermod -aG docker jenkins
sudo systemctl restart jenkins
```

Open Jenkins at `http://<host>:8080`, finish the setup wizard, and install
these plugins (Manage Jenkins → Plugins):
- **Pipeline**
- **Git**
- **Amazon ECR** / **AWS Credentials** (provides the `AmazonWebServicesCredentialsBinding` used in the Jenkinsfile)
- **Docker Pipeline**

## Step 5 — Give Jenkins permission to push to ECR and deploy to EKS

**a) IAM permissions** — create (or reuse) an IAM user/role for Jenkins with
a policy allowing at least:
- `ecr:GetAuthorizationToken`, `ecr:BatchCheckLayerAvailability`,
  `ecr:PutImage`, `ecr:InitiateLayerUpload`, `ecr:UploadLayerPart`,
  `ecr:CompleteLayerUpload`, `ecr:CreateRepository`, `ecr:DescribeRepositories`
- `eks:DescribeCluster`

**b) Cluster RBAC access** — having IAM permissions is not enough; the
identity Jenkins uses must also be mapped inside the cluster. If you created
the cluster with `eksctl` using your own AWS identity, grant the Jenkins IAM
user/role access:
```bash
eksctl create iamidentitymapping \
  --cluster fullstack-demo-cluster \
  --arn arn:aws:iam::123456789012:user/jenkins-user \
  --group system:masters \
  --username jenkins
```
(Use a narrower RBAC group than `system:masters` for anything beyond a demo.)

**c) Jenkins credentials** — in Manage Jenkins → Credentials, add:
- Kind: **AWS Credentials**, ID: `aws-creds` (matches `credentialsId` in the Jenkinsfile), with the Jenkins IAM user's Access Key ID/Secret.

## Step 6 — Update the Jenkinsfile with your values

Edit the `environment {}` block at the top of `Jenkinsfile`:
```groovy
AWS_REGION     = "us-east-1"
AWS_ACCOUNT_ID = "123456789012"     // your AWS account ID
CLUSTER_NAME   = "fullstack-demo-cluster"
```

## Step 7 — Create the Jenkins pipeline job

1. Push this whole project to a Git repo (GitHub/GitLab/CodeCommit).
2. In Jenkins: **New Item → Pipeline**.
3. Under **Pipeline**, choose "Pipeline script from SCM" → Git → your repo URL and branch.
4. Set **Script Path** to `Jenkinsfile`.
5. Save, then click **Build Now**.

## Step 8 — Watch it deploy

The pipeline will:
1. Check out the repo
2. `npm install && npm test` the backend
3. `docker build` both images
4. Log in to ECR and push both images, tagged with the Jenkins build number
5. Run `aws eks update-kubeconfig` so `kubectl` points at your cluster
6. Substitute the image tag/registry into the k8s manifests and `kubectl apply` them
7. Wait for both rollouts to finish, then print the LoadBalancer address

Get the public URL any time with:
```bash
kubectl get svc frontend-service -n fullstack-app
```
Open the `EXTERNAL-IP` (a `*.elb.amazonaws.com` hostname) in a browser —
that's your live Task Board, running on EKS, deployed by Jenkins.

## Step 9 — Iterate

Change code → push to Git → Jenkins auto-builds (if you add a webhook) or
click **Build Now**. Each build gets a new image tag equal to the Jenkins
build number, so rollouts are always traceable back to a specific build.

## Cleanup (avoid ongoing AWS charges)

```bash
kubectl delete -f k8s/
eksctl delete cluster -f eks/cluster-config.yaml
aws ecr delete-repository --repository-name eks-demo-backend  --force --region us-east-1
aws ecr delete-repository --repository-name eks-demo-frontend --force --region us-east-1
```

---

## How the pieces fit together (quick reference)

| Concern | How it's handled here |
|---|---|
| Where images live | Amazon ECR, one repo per service |
| How the frontend finds the backend | Kubernetes' internal DNS: `backend-service` resolves automatically inside the `fullstack-app` namespace |
| Public access | `frontend-service` is `type: LoadBalancer` → AWS provisions a classic ELB |
| Config | `configmap.yaml` supplies `BACKEND_PORT` to the backend Deployment |
| Health checks | `/api/health` backed liveness/readiness probes on the backend; `/` on the frontend |
| Image tagging/traceability | Jenkins `BUILD_NUMBER` is used as the Docker tag every run |
| Zero-downtime deploys | `kubectl rollout status` waits for the new pods to be Ready before the pipeline reports success; Kubernetes Deployments do rolling updates by default |

## Common next steps (not included, but natural extensions)

- Swap `type: LoadBalancer` for an **Ingress + AWS Load Balancer Controller** if you need path-based routing, HTTPS/ACM certs, or WAF.
- Add a **Helm chart** instead of plain manifests once you have multiple environments (dev/stage/prod).
- Add a **real database** (RDS/PostgreSQL, DynamoDB, etc.) instead of the in-memory task list.
- Add `kubectl` **Horizontal Pod Autoscaler** for the backend under load.
- Store Terraform/eksctl state and the Jenkinsfile's AWS account ID as Jenkins **parameters** or a `.env` file instead of hardcoding them.
