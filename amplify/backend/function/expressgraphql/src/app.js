// app.js
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { ApolloServer } = require("@apollo/server");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  PutCommand,
  ScanCommand,
  UpdateCommand,
} = require("@aws-sdk/lib-dynamodb");
const { v4: uuidv4 } = require("uuid");

const app = express();

/* ---------------- CORS ---------------- */
app.use(
  cors({
    origin: "*", // allow all origins for dev; restrict in prod
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(bodyParser.json());

/* ---------------- DynamoDB ---------------- */
const client = new DynamoDBClient({
  region: process.env.REGION || "eu-north-1",
});

const docClient = DynamoDBDocumentClient.from(client);

// Use your actual table name
const TABLE_NAME = process.env.TABLE_NAME || "todos-dev";

/* ---------------- GraphQL Schema ---------------- */
const typeDefs = `#graphql
type Todo {
  id: ID!
  name: String!
  description: String
  completed: Boolean!
}

type Query {
  getTodos: [Todo]
}

type Mutation {
  addTodo(name: String!, description: String): Todo
  toggleTodo(id: ID!): Todo
}
`;

/* ---------------- Resolvers ---------------- */
const resolvers = {
  Query: {
    getTodos: async () => {
      try {
        const result = await docClient.send(
          new ScanCommand({ TableName: TABLE_NAME })
        );
        return result.Items || [];
      } catch (err) {
        console.error("Error fetching todos:", err);
        throw new Error("Failed to fetch todos");
      }
    },
  },

  Mutation: {
    addTodo: async (_, { name, description }) => {
      const newTodo = {
        id: uuidv4(),
        name,
        description,
        completed: false,
      };

      try {
        await docClient.send(
          new PutCommand({
            TableName: TABLE_NAME,
            Item: newTodo,
          })
        );
        return newTodo;
      } catch (err) {
        console.error("Error adding todo:", err);
        throw new Error("Failed to add todo");
      }
    },

    toggleTodo: async (_, { id }) => {
      try {
        const result = await docClient.send(
          new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { id },
            UpdateExpression: "SET completed = :c",
            ExpressionAttributeValues: { ":c": true },
            ReturnValues: "ALL_NEW",
          })
        );
        return result.Attributes;
      } catch (err) {
        console.error("Error toggling todo:", err);
        throw new Error("Failed to toggle todo");
      }
    },
  },
};

/* ---------------- Apollo Server ---------------- */
const server = new ApolloServer({
  typeDefs,
  resolvers,
});

async function startServer() {
  await server.start();

app.post("/graphql", async (req, res) => {
  const { query, variables } = req.body;

  try {
    const response = await server.executeOperation({
      query,
      variables,
    });

    const result = response.body.singleResult;

    res.json(result);
  } catch (err) {
    console.error("GraphQL execution error:", err);
    res.status(500).json({ errors: [{ message: "Internal Server Error" }] });
  }
});

  // Simple GET endpoint for testing
  app.get("/graphql", (req, res) => {
    res.send("GraphQL endpoint ready");
  });
}

startServer();

module.exports = app;