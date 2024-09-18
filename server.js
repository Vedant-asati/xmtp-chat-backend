import "dotenv/config";
import { Client } from "@xmtp/mls-client";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";
import { toBytes } from "viem";
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import * as fs from "fs";

const app = express();
const server = createServer(app);
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Setup Socket.IO server
const io = new Server(server, {
    cors: {
        origin: '*',
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

// Create the cache folder if it does not exist
if (!fs.existsSync(`.cache`)) {
    fs.mkdirSync(`.cache`);
}

const addressToClientMap = new Map();

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
    const config = {
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
        })
    );
    client.addEcdsaSignature(signatureBytes);
    await client.registerIdentity();
    console.log("Client registered");
}

// Register the client with provided signature
async function registerClient(client, signature) {
    if (!client.isRegistered) {
        client.addEcdsaSignature(toBytes(signature));
        await client.registerIdentity();
        console.log("Client registered successfully");
    } else {
        console.log("Client already registered");
    }
}

// API to setup client
app.post("/setupClient", async (req, res) => {
    const { address } = req.body;
    try {
        const client = await setupClient(address);
        console.log("Inbox id: ", client.inboxId);
        console.log("Installation id: ", client.installationId);
        addressToClientMap.set(address, client);
        res.status(200).send({ signatureText: client.signatureText });
    } catch (error) {
        res.status(500).send(error.message);
    }
}); // clean

// API to register client
app.post("/registerClient", async (req, res) => {
    const { address, signature } = req.body;
    try {
        const client = addressToClientMap.get(address);
        await registerClient(client, signature);
        res.status(200).send("Client registered successfully");
    } catch (error) {
        res.status(500).send(error.message);
    }
}); // clean

// API to create a new group conversation
app.post("/createGroup", async (req, res) => {
    const { address, members, groupName, description, imageUrl } = req.body;
    try {
        const client = await setupClient(address);
        if (!client.isRegistered) {
            res.status(400).send("Client isn't registered.");
            return;
        }
        const membersArray = members.split(",");
        const canMessage = await client.canMessage(membersArray);
        if (!canMessage) {
            return res.status(400).send("One or more members do not have v3 identity");
        }
        // TODO Fix optional params
        const conversation = await client.conversations.newConversation(membersArray, 0, imageUrl, description);

        io.emit('newGroup', { groupId: conversation.id, conversation: conversation });
        res.status(200).send({ groupId: conversation.id, conversation: conversation });
    } catch (error) {
        res.status(500).send(error.message);
    }
});

// API to update group details
app.post("/updateGroup", async (req, res) => {
    const { address, groupId, name, description, imageUrl } = req.body;
    try {
        const client = await setupClient(address);
        if (!client.isRegistered) {
            res.status(400).send("Client isn't registered.");
            return;
        }
        const conversation = client.conversations.getConversationById(groupId);
        if (!conversation) {
            return res.status(404).send(`No conversation found with ID: ${groupId}`);
        }

        // Update conversation details
        if (name) await conversation.updateName(name);
        if (description) await conversation.updateDescription(description);
        if (imageUrl) await conversation.updateImageUrl(imageUrl);

        res.status(200).send("Group details updated successfully");
    } catch (error) {
        res.status(500).send(error.message);
    }
}); // clean

// API to add and remove members in a group
app.post("/updateGroupMembers", async (req, res) => {
    const { address, groupId, addMembers, removeMembers } = req.body;
    try {
        const client = await setupClient(address);
        if (!client.isRegistered) {
            res.status(400).send("Client isn't registered.");
            return;
        }
        const conversation = client.conversations.getConversationById(groupId);
        if (!conversation) {
            return res.status(404).send(`No conversation found with ID: ${groupId}`);
        }

        // Add or remove members
        if (addMembers) await conversation.addMembers(addMembers.split(","));
        if (removeMembers) await conversation.removeMembers(removeMembers.split(","));

        res.status(200).send("Group members updated successfully");
    } catch (error) {
        res.status(500).send(error.message);
    }
}); // clean

// API to manage group admins
app.post("/updateGroupAdmins", async (req, res) => {
    const { address, groupId, addAdmins, removeAdmins } = req.body;
    try {
        const client = await setupClient(address);
        if (!client.isRegistered) {
            res.status(400).send("Client isn't registered.");
            return;
        }
        const conversation = client.conversations.getConversationById(groupId);
        if (!conversation) {
            return res.status(404).send(`No conversation found with ID: ${groupId}`);
        }

        // Add or remove admins
        if (addAdmins) await conversation.addAdmin(addAdmins);
        if (removeAdmins) await conversation.removeAdmin(removeAdmins);

        res.status(200).send("Group admins updated successfully");
    } catch (error) {
        res.status(500).send(error.message);
    }
}); // clean

// API to send a message to a group
app.post("/sendMessage", async (req, res) => {
    const { address, groupId, messageContent } = req.body;
    try {
        const client = await setupClient(address);
        if (!client.isRegistered) {
            res.status(500).send("Client isn't registered.");
            return;
        }
        const conversation = client.conversations.getConversationById(groupId);
        if (!conversation) {
            return res.status(404).send(`No conversation found with ID: ${groupId}`);
        }
        await conversation.send(messageContent);
        const name = conversation.name;

        io.emit('newMessage', { groupId, groupName: name, sender: address, messageContent }); // Notify all clients via WebSocket
        res.status(200).send(`Message sent to group ${groupId}: ${messageContent}`);
    } catch (error) {
        res.status(500).send(error.message);
    }
}); // clean

// API to list all group conversations
app.post("/conversations", async (req, res) => {
    const { address } = req.body;
    try {
        const client = await setupClient(address);
        if (!client.isRegistered) {
            res.status(500).send("Client isn't registered.");
            return;
        }
        await client.conversations.sync();
        const rawConversations = await client.conversations.list();
        rawConversations.forEach(async (conv) => {
            await conv.sync();
        });
        const conversations = rawConversations.map((group) => {
            return {
                id: group.id,
                name: group.name,
                imageUrl: group.imageUrl,
                description: group.description,
                pinnedFrameUrl: group.pinnedFrameUrl,
                isActive: group.isActive,
                addedByInboxId: group.addedByInboxId,
                createdAtNs: group.createdAtNs,
                createdAt: new Date(group.createdAtNs / 1000000).toISOString(),  // Convert to ISO string
                metadata: {
                    creatorInboxId: group.addedByInboxId,
                    conversationType: "default"
                },
                members: group.members.map(member => ({
                    inboxId: member.inboxId,
                    accountAddresses: member.accountAddresses,
                    installationIds: member.installationIds,
                    permissionLevel: member.permissionLevel
                })),
                admins: group.admins,
                superAdmins: group.superAdmins,
                permissions: {
                    policyType: "group-permissions-policyType",
                    policySet: "group-permissions-policySet"
                },
                latestMessages: group.messages()
                // latestMessage: group.messages()[group.messages().length - 1]
            };
        });
        res.status(200).send({ conversations });
    } catch (error) {
        res.status(500).send(error.message);
    }
}); // clean

// API to sync and fetch group messages by group ID
app.post("/:id/messages", async (req, res) => {
    console.log(req.params);
    console.log(req.body);
    console.log(req.data);

    console.log("\n");
    // console.log(req);
    const { address } = req.body;
    const { id } = req.params;
    try {
        const client = await setupClient(address);
        if (!client.isRegistered) {
            res.status(500).send("Client isn't registered.");
            return;
        }
        const conversation = client.conversations.getConversationById(id);
        if (!conversation) {
            return res.status(404).send("Group not found");
        }
        await conversation.sync();
        const messages = conversation.messages();
        res.status(200).send(messages);
    } catch (error) {
        res.status(500).send(error.message);
    }
}); // clean

// API to test WebSocket message sending
app.get("/testnewmsg", (req, res) => {
    io.emit('message', "Test message sent!");
    res.status(200).send("Test message sent.");
});

// Start the server
server.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
