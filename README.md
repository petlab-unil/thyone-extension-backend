# Thyone Extension

Thyone is a collaborative extension for the classic Jupyter Notebook developed by the PET Lab at the University of Lausanne. This extension is a research artifact built for a project aimed at supporting collaboration in programming learning for novices. The research has been published in CSCW 2023, and the paper can be found [here](https://doi.org/10.1145/3610089). This extension has two main features: (i) Enables users to plan their problem-solving process by creating flowcharts, (ii) Facilitates random pairing of users logged into Jupyterhub, allowing them to chat with each other, share text messages, and exchange code and output cells for collaborative programming and learning.

## Backend Code

In this repository, you will find the backend code for the Thyone extension. It handles the server-side functionality of socket.io, which is used for sending messages between Thyone users. Additionally, it implements the logging of user actions and messages in Thyone in a MongoDB database instance.

Once the backend code is set up and running, proceed to setup the [Thyone Frontend Code](link here).

## Prerequisites

Please make sure that [Node.js](https://nodejs.org/en) and [Mongo DB](https://www.mongodb.com/docs/manual/installation/) are installed on your system.

## Installation

To install the Thyone backend in your local environment, follow these steps:

1. Create a `.env` file at the project path (outside the src folder) with the following entry:

   ```
   MONGO_HOSTNAME=localhost:27017
   HUB_PATH=http://localhost:8081/hub/api
   USERS_CREATE_KEY="addYourKey"
   ```

2. Install dependencies:

   ```
   $ npm i
   ```

3. Run the code locally with hot reloading:

   ```
   $ npm run dev
   ```

4. Create and run a local instance of the MongoDB database with specified users (see [here](https://www.mongodb.com/docs/manual/core/databases-and-collections/) for guidance to work with mongo).

    - Create a database named **hec-chat**.
    - In the hec-chat database create a collection named **users**.
    - Add the first document in the **users** collection. The document should follow this structure:

      ```
      {
        "userName": "yourJupyterHubUsername",
        "firstName": "yourFirstName",
        "lastName": "yourLastName",
        "email" : "yourEmail",
        "group": "experimental",
        "key": "theKeyThatYouChoseInYourEnvFile"
      }
      ```

      This document represents one user of Thyone at initiation.

    - This entry can be created either using MongoDB commands (see [here](https://www.mongodb.com/docs/manual/core/databases-and-collections/)), or can also be created in the database locally by running a POST request in the terminal:

      ```
      $ curl --header "Content-Type: application/json" \
             --request POST \
             --data '{"userName":"yourJupyterHubUsername", "firstName":"yourFirstName", "lastName": "yourLastName", "email": "yourEmail", "group": "experimental", "key": "theKeyThatYouChoseInYourEnvFile"}' \
             http://localhost:3000/users/create
      ```

    - Please ensure the value of "group" is set to "experimental" for the extension to be visible on the UI after running the frontend code.
    - Also, ensure that the value of "userName" is an exact match to your Jupyterhub username.


## Citation

If you use this in your research, please consider citing:

*Lahari Goswami, Alexandre Senges, Thibault Estier, and Mauro Cherubini. 2023. Supporting Co-Regulation and Motivation in Learning Programming in Online Classrooms. Proc. ACM Hum.-Comput. Interact. 7, CSCW2, Article 298 (October 2023), 29 pages. [https://doi.org/10.1145/3610089](https://doi.org/10.1145/3610089)*
