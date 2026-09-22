pipeline {
    agent any

    environment {
        AWS_ACCOUNT_ID = '576174293202'
        AWS_REGION     = 'ap-south-1'
        ECR_URI        = '576174293202.dkr.ecr.ap-south-1.amazonaws.com/uttam-laboratory'
    }

    stages {
        stage('Build & Tag Docker Image') {
            steps {
                echo 'Building and tagging Docker image for AWS ECR...'
                sh '''
                    docker build -t uttam-laboratory:latest .
                    docker tag uttam-laboratory:latest ${ECR_URI}:latest
                '''
            }
        }

        stage('Push Image to AWS ECR') {
            steps {
                echo 'Authenticating with AWS ECR and pushing image...'
                sh '''
                    aws ecr get-login-password --region ${AWS_REGION} | docker login --username AWS --password-stdin ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com
                    aws ecr describe-repositories --repository-names uttam-laboratory --region ${AWS_REGION} || aws ecr create-repository --repository-name uttam-laboratory --region ${AWS_REGION}
                    docker push ${ECR_URI}:latest
                '''
            }
        }

        stage('Deploy Docker Container') {
            steps {
                echo 'Cleaning up host port 5000 and launching container from ECR...'
                sh '''
                    npx pm2 delete uttam-backend || true
                    fuser -k 5000/tcp || true
                    docker stop uttam-laboratory || true
                    docker rm uttam-laboratory || true
                    docker run -d \
                        -p 5000:5000 \
                        --name uttam-laboratory \
                        --restart always \
                        -v uttam_db_data:/app/backend/prisma \
                        ${ECR_URI}:latest
                '''
            }
        }

        stage('Cleanup Stale Images') {
            steps {
                echo 'Pruning unused Docker images...'
                sh 'docker image prune -f'
            }
        }
    }
}