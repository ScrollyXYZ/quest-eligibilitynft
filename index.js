const Web3 = require('web3');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const questContractABI = require('./QuestContract.json').abi;
const nftDirectoryABI = require('./NftDirectory.json').abi;

const web3 = new Web3(process.env.WEB3_PROVIDER);

const questContract = new web3.eth.Contract(questContractABI, process.env.QUEST_CONTRACT_ADDRESS);
const nftDirectory = new web3.eth.Contract(nftDirectoryABI, process.env.NFT_DIRECTORY_ADDRESS);

let lastKnownLength = 0;

async function initialize() {
    lastKnownLength = await nftDirectory.methods.getNftContractsArrayLength().call();
}

async function checkNewContracts() {
    const currentLength = await nftDirectory.methods.getNftContractsArrayLength().call();

    if (currentLength > lastKnownLength) {
        for (let i = lastKnownLength; i < currentLength; i++) {
            const nftContracts = await nftDirectory.methods.getNftContracts(i, i + 1).call();
            for (const nftContractAddress of nftContracts) {
                const nftContract = new web3.eth.Contract(nftDirectoryABI, nftContractAddress);
                const owner = await nftContract.methods.owner().call();
                await updateEligibility(owner);
            }
        }
        lastKnownLength = currentLength;
    }
}

async function updateEligibility(user) {
    const updateTx = questContract.methods.updateEligibility([user], [true]);
    const gas = await updateTx.estimateGas({ from: process.env.OWNER_ADDRESS });
    const data = updateTx.encodeABI();

    const tx = {
        to: process.env.QUEST_CONTRACT_ADDRESS,
        data,
        gas,
        from: process.env.OWNER_ADDRESS
    };

    const signedTx = await web3.eth.accounts.signTransaction(tx, process.env.PRIVATE_KEY);
    await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
}

initialize().then(() => {
    console.log('Initialization complete. Monitoring for new NFT contracts...');
    setInterval(checkNewContracts, 60000); // Check every minute
}).catch(err => {
    console.error('Initialization error:', err);
});
