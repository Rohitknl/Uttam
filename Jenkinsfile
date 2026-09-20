pipeline {
    agent any

    stages {
        stage('Install Dependencies') {
            steps {
                echo 'Installing root, frontend, and backend dependencies...'
                sh 'npm install --include=dev'
                dir('frontend') {
                    sh 'npm install --include=dev'
                }
                dir('backend') {
                    sh 'npm install --include=dev'
                }
            }
        }

        stage('Build Frontend') {
            steps {
                echo 'Building React frontend...'
                dir('frontend') {
                    sh 'npm run build'
                }
            }
        }

        stage('Setup Backend & Prisma') {
            steps {
                echo 'Generating Prisma Client...'
                dir('backend') {
                    sh 'npx prisma generate'
                }
            }
        }

        stage('Deploy Application') {
            environment {
                NODE_ENV = 'production'
            }
            steps {
                echo 'Deploying backend with PM2...'
                dir('backend') {
                    sh '''
                        pm2 restart uttam-backend || pm2 start src/index.js --name "uttam-backend"
                    '''
                }
            }
        }
    }
}