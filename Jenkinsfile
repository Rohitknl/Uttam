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
                echo 'Building React frontend bundle...'
                dir('frontend') {
                    sh 'npm run build'
                }
            }
        }

        stage('Setup Backend & Database') {
            steps {
                echo 'Generating Prisma Client and setting up SQLite database...'
                dir('backend') {
                    sh 'npx prisma generate'
                    sh 'npx prisma db push --skip-generate'
                }
            }
        }

        stage('Deploy Application') {
            environment {
                NODE_ENV = 'production'
                PORT = '5000'
                STATIC_DIR = '../frontend/dist'
                JENKINS_NODE_COOKIE = 'dontKillMe'
                BUILD_ID = 'dontKillMe'
            }
            steps {
                echo 'Deploying application with PM2 on port 5000...'
                dir('backend') {
                    sh '''
                        export BUILD_ID=dontKillMe
                        npx pm2 delete uttam-backend || true
                        PORT=5000 STATIC_DIR=../frontend/dist npx pm2 start src/index.js --name "uttam-backend"
                        npx pm2 save
                    '''
                }
            }
        }
    }
}