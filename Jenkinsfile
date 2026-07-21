pipeline {
    agent any

    environment {
        AWS_REGION     = "ap-south-1"
        AWS_ACCOUNT_ID = "660815084808"
        ECR_REGISTRY   = "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

        BACKEND_REPO   = "eks-demo-backend"
        FRONTEND_REPO  = "eks-demo-frontend"

        // CHANGE THIS TO YOUR ACTUAL EKS CLUSTER NAME
        CLUSTER_NAME   = "YOUR_EKS_CLUSTER_NAME"

        K8S_NAMESPACE  = "fullstack-app"
        IMAGE_TAG      = "${BUILD_NUMBER}"
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
                sh """
                docker build -t ${BACKEND_REPO}:${IMAGE_TAG} ./backend
                docker build -t ${FRONTEND_REPO}:${IMAGE_TAG} ./frontend
                """
            }
        }

        stage('Push Images to ECR') {
            steps {
                withCredentials([
                    [$class: 'AmazonWebServicesCredentialsBinding',
                    credentialsId: 'aws-ecr']
                ]) {

                    sh """
                    aws ecr get-login-password --region ${AWS_REGION} | docker login \
                    --username AWS \
                    --password-stdin ${ECR_REGISTRY}

                    aws ecr describe-repositories \
                    --repository-names ${BACKEND_REPO} \
                    --region ${AWS_REGION} \
                    || aws ecr create-repository \
                    --repository-name ${BACKEND_REPO} \
                    --region ${AWS_REGION}

                    aws ecr describe-repositories \
                    --repository-names ${FRONTEND_REPO} \
                    --region ${AWS_REGION} \
                    || aws ecr create-repository \
                    --repository-name ${FRONTEND_REPO} \
                    --region ${AWS_REGION}

                    docker tag ${BACKEND_REPO}:${IMAGE_TAG} ${ECR_REGISTRY}/${BACKEND_REPO}:${IMAGE_TAG}
                    docker tag ${FRONTEND_REPO}:${IMAGE_TAG} ${ECR_REGISTRY}/${FRONTEND_REPO}:${IMAGE_TAG}

                    docker push ${ECR_REGISTRY}/${BACKEND_REPO}:${IMAGE_TAG}
                    docker push ${ECR_REGISTRY}/${FRONTEND_REPO}:${IMAGE_TAG}
                    """
                }
            }
        }

        stage('Deploy to EKS') {
            steps {
                withCredentials([
                    [$class: 'AmazonWebServicesCredentialsBinding',
                    credentialsId: 'aws-ecr']
                ]) {

                    sh """
                    aws eks update-kubeconfig \
                    --region ${AWS_REGION} \
                    --name ${CLUSTER_NAME}

                    mkdir -p k8s-render
                    cp k8s/*.yaml k8s-render/

                    sed -i "s|<ECR_REPO_URI>|${ECR_REGISTRY}|g" k8s-render/backend-deployment.yaml
                    sed -i "s|<TAG>|${IMAGE_TAG}|g" k8s-render/backend-deployment.yaml

                    sed -i "s|<ECR_REPO_URI>|${ECR_REGISTRY}|g" k8s-render/frontend-deployment.yaml
                    sed -i "s|<TAG>|${IMAGE_TAG}|g" k8s-render/frontend-deployment.yaml

                    kubectl apply -f k8s-render/namespace.yaml
                    kubectl apply -f k8s-render/configmap.yaml
                    kubectl apply -f k8s-render/backend-deployment.yaml
                    kubectl apply -f k8s-render/backend-service.yaml
                    kubectl apply -f k8s-render/frontend-deployment.yaml
                    kubectl apply -f k8s-render/frontend-service.yaml

                    kubectl rollout status deployment/backend \
                    -n ${K8S_NAMESPACE} \
                    --timeout=180s

                    kubectl rollout status deployment/frontend \
                    -n ${K8S_NAMESPACE} \
                    --timeout=180s
                    """
                }
            }
        }

        stage('Show Access URL') {
            steps {
                sh """
                kubectl get svc frontend-service \
                -n ${K8S_NAMESPACE} \
                -o wide
                """
            }
        }
    }

    post {

        success {
            echo "Deployment Successful."
        }

        failure {
            echo "Pipeline Failed."
        }

        always {
            sh 'docker image prune -f || true'
        }
    }
}
