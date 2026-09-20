pipeline {
    agent any

    environment {
        DATABASE_URL = 'file:./dev.db'
        PORT = '5000'
    }

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
                echo 'Setting up backend environment and SQLite database...'
                dir('backend') {
                    sh '''
                        if [ ! -f .env ]; then
                            cp .env.example .env
                        fi
                        npx prisma generate
                        npx prisma db push --skip-generate --accept-data-loss
                    '''
                }
            }
        }

        stage('Deploy Application') {
            environment {
                NODE_ENV = 'production'
                PORT = '5000'
                DATABASE_URL = 'file:./dev.db'
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
                        PORT=5000 DATABASE_URL=file:./dev.db STATIC_DIR=../frontend/dist npx pm2 start src/index.js --name "uttam-backend" --update-env
                        npx pm2 save
                    '''
                }
            }
        }
    }
}