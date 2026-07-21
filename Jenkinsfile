// Jenkins declarative pipeline: build -> test -> dockerize -> push to ECR -> deploy to EKS
//
// Prerequisites on the Jenkins agent (see README.md for install commands):
//   - docker, aws-cli v2, kubectl, git, node.js (for the "test" stage)
// Jenkins credentials required (Manage Jenkins > Credentials):
//   - "aws-creds"  : AWS Access Key ID / Secret Access Key (Kind: AWS Credentials)
//     -> must belong to an IAM user/role with ECR push + EKS describe permissions,
//        and must be mapped into the cluster's aws-auth (see README step 5).

pipeline {
    agent any

    environment {
        AWS_REGION       = "ap-south-1"
        AWS_ACCOUNT_ID   = "660815084808"          // <-- replace with your AWS account ID
        ECR_REGISTRY     = "660815084808.dkr.ecr.ap-south-1.amazonaws.com"
        BACKEND_REPO     = "eks-demo-backend"
        FRONTEND_REPO    = "eks-demo-frontend"
        CLUSTER_NAME     = "fullstack-demo-cluster"
        K8S_NAMESPACE    = "fullstack-app"
        IMAGE_TAG        = "${env.BUILD_NUMBER}"
    }

    options {
        timestamps()
        buildDiscarder(logRotator(numToKeepStr: '20'))
    }

    stages {

        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Install & Test Backend') {
            steps {
                dir('backend') {
                    sh 'npm install'
                    sh 'npm test'
                }
            }
        }

        stage('Build Docker Images') {
            steps {
                sh "docker build -t ${BACKEND_REPO}:${IMAGE_TAG} ./backend"
                sh "docker build -t ${FRONTEND_REPO}:${IMAGE_TAG} ./frontend"
            }
        }

        stage('Push Images to ECR') {
            steps {
                withCredentials([[
                    $class: 'AmazonWebServicesCredentialsBinding',
                    credentialsId: 'aws-creds'
                ]]) {
                    sh '''
                        aws ecr get-login-password --region $AWS_REGION | \
                            docker login --username AWS --password-stdin $ECR_REGISTRY

                        # Create the repos if they don't exist yet (safe to re-run)
                        aws ecr describe-repositories --repository-names $BACKEND_REPO --region $AWS_REGION || \
                            aws ecr create-repository --repository-name $BACKEND_REPO --region $AWS_REGION
                        aws ecr describe-repositories --repository-names $FRONTEND_REPO --region $AWS_REGION || \
                            aws ecr create-repository --repository-name $FRONTEND_REPO --region $AWS_REGION

                        docker tag ${BACKEND_REPO}:${IMAGE_TAG} ${ECR_REGISTRY}/${BACKEND_REPO}:${IMAGE_TAG}
                        docker tag ${FRONTEND_REPO}:${IMAGE_TAG} ${ECR_REGISTRY}/${FRONTEND_REPO}:${IMAGE_TAG}

                        docker push ${ECR_REGISTRY}/${BACKEND_REPO}:${IMAGE_TAG}
                        docker push ${ECR_REGISTRY}/${FRONTEND_REPO}:${IMAGE_TAG}
                    '''
                }
            }
        }

        stage('Deploy to EKS') {
            steps {
                withCredentials([[
                    $class: 'AmazonWebServicesCredentialsBinding',
                    credentialsId: 'aws-creds'
                ]]) {
                    sh '''
                        aws eks update-kubeconfig --region $AWS_REGION --name $CLUSTER_NAME

                        # Substitute the placeholders in the manifests with the real
                        # ECR registry URI and this build's image tag, into a scratch copy
                        mkdir -p k8s-render
                        cp k8s/*.yaml k8s-render/

                        sed -i "s|<ECR_REPO_URI>|${ECR_REGISTRY}|g; s|<TAG>|${IMAGE_TAG}|g" k8s-render/backend-deployment.yaml
                        sed -i "s|<ECR_REPO_URI>|${ECR_REGISTRY}|g; s|<TAG>|${IMAGE_TAG}|g" k8s-render/frontend-deployment.yaml

                        kubectl apply -f k8s-render/namespace.yaml
                        kubectl apply -f k8s-render/configmap.yaml
                        kubectl apply -f k8s-render/backend-deployment.yaml
                        kubectl apply -f k8s-render/backend-service.yaml
                        kubectl apply -f k8s-render/frontend-deployment.yaml
                        kubectl apply -f k8s-render/frontend-service.yaml

                        kubectl rollout status deployment/backend  -n $K8S_NAMESPACE --timeout=120s
                        kubectl rollout status deployment/frontend -n $K8S_NAMESPACE --timeout=120s
                    '''
                }
            }
        }

        stage('Show Access URL') {
            steps {
                sh '''
                    echo "Frontend LoadBalancer address (may take a couple of minutes to become reachable):"
                    kubectl get svc frontend-service -n $K8S_NAMESPACE -o wide
                '''
            }
        }
    }

    post {
        success {
            echo "Deployed build #${IMAGE_TAG} to EKS cluster ${CLUSTER_NAME} successfully."
        }
        failure {
            echo "Pipeline failed — check the stage logs above."
        }
        always {
            sh 'docker image prune -f || true'
        }
    }
}
