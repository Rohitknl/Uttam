pipeline {
    agent any

    stages {
        stage('Build Docker Image') {
            steps {
                echo 'Building Docker image...'
                sh 'docker build -t uttam-laboratory:latest .'
            }
        }

        stage('Deploy Docker Container') {
            steps {
                echo 'Stopping old container and launching updated container...'
                sh '''
                    docker stop uttam-laboratory || true
                    docker rm uttam-laboratory || true
                    docker run -d \
                        -p 5000:5000 \
                        --name uttam-laboratory \
                        --restart always \
                        -v uttam_db_data:/app/backend/prisma \
                        uttam-laboratory:latest
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