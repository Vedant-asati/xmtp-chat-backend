# CipherConnect
![cover](https://github.com/user-attachments/assets/ef8e1a6b-4d4f-4ba1-8c2f-3a7a437b73a0)

As currently there is no social media platform in web3 that integrates AI tools and creator earning rewards. Also web3 native social platforms pose friction to the next billion users onboarding to web3, This project is apart of a social place(social media) with content moderation, creator earning rewards, robust governance and other on-chain AI features. This platform has social logins(Google, X, Farcaster, Facebook, etc.)  integrated. This has potential to reduce the onboarding friction for the next billion users to the ethereum. On chain AI will provide multiple features such as regulation of the community by checking illegal, spam and unjust content. It will also include creator earning rewards, which will be calculated by analyzing the content created using ML models using galadriel tee models. 
Further steps include implementing account abstraction and integrating smart accounts, this project would be integrated into platforms such as farcaster, warpcast, hey.

## Technical Details
This project uses web3auth for social logins, allowing seamless login/ experience. This project uses xmtp-js and mls client for building p2p and group chats. Integration of group chats posed a problem as the mls client is in alpha version. Group chats are integrated into a frontend where users will be able to add members to the group chat, add ai agents, bots into the chat. User will subscribe and get whitelisted for token gated groups. Subscriptions and push notifications are implemented using xmtp tools. The overall app is built imlementing best practices according to mls specifications.
AI agents receive data from galadriel oracles, which provide data from on-chain ML models running in galadriel trusted execution environment(tee).
We are also using envio's HyperIndex to index blockchain data.

## Frontend
https://github.com/Vedant-asati/xmtp-chat

## Tech Stack
Express, NodeJs, React, viem, wagmi, xmtp, socket.io

## Install the package

```bash
npm install
```

## Run the development server

```bash
npm run dev
```
