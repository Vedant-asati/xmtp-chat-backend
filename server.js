import "dotenv/config";
import { Client } from "@xmtp/mls-client";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";
import { toBytes } from "viem";
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import * as fs from "fs";
import { sign } from "crypto";


const app = express();
const server = createServer(app);
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Setup Socket.IO server
const io = new Server(server, {
    cors: {
        origin: '*', // Allow any origin for development
        methods: ['GET', 'POST'],
    },
});

// Socket.IO connection
io.on('connection', (socket) => {
    console.log('New client connected', socket.id);
    socket.emit('connection', null);

    socket.on('disconnect', () => {
        console.log('Client disconnected', socket.id);
    });
});

// Client mappings
const addressToClientMap = new Map();


//   Set up the XMTP client with the wallet and database path
if (!fs.existsSync(`.cache`)) {
    fs.mkdirSync(`.cache`);
}

// Helper function to create a wallet from a private key
async function createWallet() {
    let key = process.env.KEY;
    if (!key) {
        key = generatePrivateKey();
        console.error("KEY not set. Using random one.");
        console.log("Random private key: ", key);
    }

    const account = privateKeyToAccount(key);
    const wallet = createWalletClient({
        account,
        chain: mainnet,
        transport: http(),
    });
    console.log(`Initialized wallet ${account.address}`);
    return wallet;
}

// Helper function to set up XMTP client
async function setupClient(address) {
    let config = {
        env: "dev",
        dbPath: `.cache/${address}-${"dev"}`,
    };
    const client = await Client.create(address, config);
    return client;
}

// Register the client with stored key
async function registerClientDefault(client) {
    const wallet = await createWallet();
    const signatureBytes = toBytes(
        await wallet.signMessage({
            message: client.signatureText,
        }),
    );
    console.log("signatureBytes", signatureBytes);
    console.log("client.signatureTextDefault", client.signatureText);
    client.addEcdsaSignature(signatureBytes);
    await client.registerIdentity();
    console.log("Client registered");
}
// Register the client if not already registered
async function registerClient(client, signature) {
    if (!client.isRegistered) {
    console.log("Trying to register client...")
    client.addEcdsaSignature(toBytes(signature));
    await client.registerIdentity();
    console.log("Client registered successfully...");
    console.log("client.isRegistered:",client.isRegistered);
    }
    else console.log("Client already registered");
}

// API to send a message to a group
app.post("/sendMessage", async (req, res) => {
    const { groupId, messageContent } = req.body;
    try {
        const wallet = await createWallet();
        const client = await setupClient(address, {
            dbPath: `.cache/${wallet.account?.address}-${"dev"}`,
        });
        await registerClient(client, wallet);

        const conversation = client.conversations.getConversationById(groupId);
        if (!conversation) {
            return res.status(404).send(`No conversation found with ID: ${groupId}`);
        }

        await conversation.send(messageContent);
        io.emit('newMessage', { groupId, messageContent }); // Notify all clients via WebSocket
        res.status(200).send(`Message sent to group ${groupId}: ${messageContent}`);
    } catch (error) {
        res.status(500).send(error.message);
    }
});

// API to create a new group conversation
app.post("/createGroup", async (req, res) => {
    const { members } = req.body;
    try {
        const wallet = await createWallet();
        const client = await setupClient(address, {
            dbPath: `.cache/${wallet.account?.address}-${"dev"}`,
        });
        await registerClient(client, wallet);

        const membersArray = members.split(',')
        const canMessage = await client.canMessage(members);
        if (!canMessage) {
            return res.status(400).send("One or more members do not have v3 identity");
        }

        const conversation = await client.conversations.newConversation(members);
        io.emit('newGroup', { groupId: conversation.id, members }); // Notify all clients about the new group
        res.status(200).send({ groupId: conversation.id });
    } catch (error) {
        res.status(500).send(error.message);
    }
});

// API to sync and list conversations
app.get("/conversations", async (req, res) => {
    try {
        const wallet = await createWallet();
        const client = await setupClient(address, {
            dbPath: `.cache/${wallet.account?.address}-${"dev"}`,
        });
        await registerClient(client, wallet);

        await client.conversations.sync();
        const conversations = await client.conversations.list();
        res.status(200).send({ conversations });
    } catch (error) {
        res.status(500).send(error.message);
    }
});
// API to setup client
app.post("/setupClient", async (req, res) => {
    const { address } = req.body;
    console.log(typeof (address), address);
    try {
        const client = await setupClient(address);
        console.log("Inbox id: ", client.inboxId);
        console.log("installation id: ", client.installationId);
        addressToClientMap.set(address, client);
        res.status(200).send({ signatureText: client.signatureText });
    } catch (error) {
        res.status(500).send(error.message);
    }
});
// API to register client
app.post("/registerClient", async (req, res) => {
    const { address, signature } = req.body;
    try {
        const client = addressToClientMap.get(address);
        if (!client) {
            res.status(500).send("Client not set up. First setup the client.");
            return;
        }
        // await registerClientDefault(client);
        await registerClient(client, signature);
        res.status(200).send("success");
    } catch (error) {
        console.error("Error with Registering client. Please try again.")
        console.log(error);
        res.status(500).send(error.message);
    }
});

// API to stream all messages
app.get("/streamMessages", async (req, res) => {
    try {
        const wallet = await createWallet();
        const client = await setupClient(address, {
            dbPath: `.cache/${wallet.account?.address}-${"dev"}`,
        });
        await registerClient(client, wallet);

        const stream = await client.conversations.streamAllMessages();
        stream.on("data", (message) => {
            console.log(`Streamed message: ${message.content}`);
            io.emit('newMessageStream', { message }); // Push streamed messages to WebSocket clients
        });

        res.status(200).send("Streaming started. Check server logs for message streams.");
    } catch (error) {
        res.status(500).send(error.message);
    }
});


server.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
