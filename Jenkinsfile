pipeline {
    agent any

    environment {
        NODE_ENV = 'production'
    }

    stages {
        stage('Install Dependencies') {
            steps {
                echo 'Installing root, frontend, and backend dependencies...'
                sh 'npm install'
                sh 'npm --prefix frontend install'
                sh 'npm --prefix backend install'
            }
        }

        stage('Build Frontend') {
            steps {
                echo 'Building React frontend...'
                sh 'npm --prefix frontend run build'
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