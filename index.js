const Web3 = require('web3');
const fs = require('fs');
require('dotenv').config();

// Load contract ABIs from JSON files
const questContractABI = require('./QuestContract.json').abi;
const nftDirectoryABI = require('./NftDirectory.json').abi;

// Initialize Web3 with the provider specified in the .env file
const web3 = new Web3(process.env.WEB3_PROVIDER);

// Initialize contract instances with their respective ABIs and addresses
const questContract = new web3.eth.Contract(questContractABI, process.env.QUEST_CONTRACT_ADDRESS);
const nftDirectory = new web3.eth.Contract(nftDirectoryABI, process.env.NFT_DIRECTORY_ADDRESS);

let lastKnownLength = 0;
const lastIndexFilePath = './lastIndex.txt';
const processedUsersFilePath = './processedUsers.json';

// Read the index of the last processed contract from the file
function readLastIndex() {
    if (fs.existsSync(lastIndexFilePath)) {
        const lastIndex = fs.readFileSync(lastIndexFilePath, 'utf8');
        console.log(`Read last index: ${lastIndex}`);  // Debug log
        return parseInt(lastIndex, 10);
    }
    return -1; // Indicate that no index has been processed yet
}

// Write the index of the last processed contract to the file
function writeLastIndex(index) {
    console.log(`Writing last index: ${index}`);  // Debug log
    fs.writeFileSync(lastIndexFilePath, index.toString(), 'utf8');
}

// Read the list of processed users
function readProcessedUsers() {
    if (fs.existsSync(processedUsersFilePath)) {
        const data = fs.readFileSync(processedUsersFilePath, 'utf8');
        return JSON.parse(data);
    }
    return {};
}

// Write the list of processed users
function writeProcessedUsers(processedUsers) {
    fs.writeFileSync(processedUsersFilePath, JSON.stringify(processedUsers), 'utf8');
}

// Initialization function to get the current length of the NFT contracts list
async function initialize() {
    lastKnownLength = await nftDirectory.methods.getNftContractsArrayLength().call();
    console.log(`Initial NFT contracts length: ${lastKnownLength}`);
}

// Function to check for newly created NFT contracts
async function checkNewContracts() {
    const currentLength = await nftDirectory.methods.getNftContractsArrayLength().call();
    let lastIndex = readLastIndex();
    let processedUsers = readProcessedUsers();

    console.log(`Current length: ${currentLength}, Last index: ${lastIndex}`);  // Debug log

    // Ensure lastIndex is correctly adjusted for the current length
    if (lastIndex === -1) {
        lastIndex = 0;
    }

    if (currentLength > lastIndex) {
        for (let i = lastIndex; i < currentLength; i++) {
            await processContractAtIndex(i, processedUsers);
        }
        writeLastIndex(currentLength - 1);
        writeProcessedUsers(processedUsers);
        lastKnownLength = currentLength;
    } else {
        console.log(`No new contracts to process. Current length: ${currentLength}, Last index: ${lastIndex}`);
    }
}

// Function to process a contract at a given index
async function processContractAtIndex(index, processedUsers) {
    try {
        const currentLength = await nftDirectory.methods.getNftContractsArrayLength().call();
        if (index < currentLength) {
            console.log(`Processing contract at index: ${index}`); // Debug log
            const nftContracts = await nftDirectory.methods.getNftContracts(index, index + 1).call();
            for (const nftContractAddress of nftContracts) {
                console.log(`Processing NFT contract: ${nftContractAddress}`); // Debug log
                const nftContract = new web3.eth.Contract(nftDirectoryABI, nftContractAddress);
                const owner = await nftContract.methods.owner().call();
                console.log(`NFT contract owner: ${owner}`); // Debug log
                if (!processedUsers[owner]) {
                    await updateEligibility(owner);
                    processedUsers[owner] = true;
                }
            }
        } else {
            console.warn(`Index ${index} is out of bounds, current length is ${currentLength}`);
        }
    } catch (error) {
        console.error(`Error processing contract at index ${index}:`, error);
    }
}

// Function to update the eligibility of users
async function updateEligibility(user) {
    try {
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

        console.log(`Eligibility updated for user: ${user}`);
    } catch (error) {
        console.error(`Error updating eligibility for user ${user}:`, error);
    }
}

// Initialize and start monitoring for new NFT contracts
initialize().then(() => {
    console.log('Initialization complete. Monitoring for new NFT contracts...');
    setInterval(checkNewContracts, 60000); // Check every minute
}).catch(err => {
    console.error('Initialization error:', err);
});
