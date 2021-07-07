# HEC extension Backend

## Install

    npm i

## Run locally with hot reloading

    npm run dev

## .env

    MONGO_HOSTNAME=localhost:27017
    HUB_PATH=http://localhost:8081/hub/api
    USERS_CREATE_KEY=

## create a user

run a POST request in the terminal to create a user in the db locally

    curl --header "Content-Type: application/json" \
    --request POST \
    --data '{"userName":"yourUserName", "firstName":"yourFirstName", "lastName": "yourLastName", "email": "yourEmail", "group": "experimental", "key": "theKeyThatYouChoseInYourEnvFile"}' \
    http://localhost:3000/users/create
