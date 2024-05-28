const Web3 = require('web3');
const fs = require('fs');
require('dotenv').config();

// Charger les ABIs des contrats depuis les fichiers JSON
const questContractABI = require('./QuestContract.json').abi;
const nftDirectoryABI = require('./NftDirectory.json').abi;

// Initialiser Web3 avec le fournisseur spécifié dans le fichier .env
const web3 = new Web3(process.env.WEB3_PROVIDER);

// Initialiser les instances de contrat avec leurs ABIs et adresses respectives
const questContract = new web3.eth.Contract(questContractABI, process.env.QUEST_CONTRACT_ADDRESS);
const nftDirectory = new web3.eth.Contract(nftDirectoryABI, process.env.NFT_DIRECTORY_ADDRESS);

let lastKnownLength = 0;

// Fonction d'initialisation pour récupérer la longueur actuelle de la liste des contrats NFT et mettre à jour les utilisateurs initiaux
async function initialize() {
    lastKnownLength = await nftDirectory.methods.getNftContractsArrayLength().call();
    console.log(`Initial NFT contracts length: ${lastKnownLength}`);

    for (let i = 0; i < lastKnownLength; i++) {
        const nftContracts = await nftDirectory.methods.getNftContracts(i, i + 1).call();
        for (const nftContractAddress of nftContracts) {
            const nftContract = new web3.eth.Contract(nftDirectoryABI, nftContractAddress);
            const owner = await nftContract.methods.owner().call();
            await updateEligibility(owner);
        }
    }
}

// Fonction pour vérifier les nouveaux contrats NFT créés
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

// Fonction pour mettre à jour l'éligibilité des utilisateurs
async function updateEligibility(user) {
    try {
        const nonce = await web3.eth.getTransactionCount(process.env.OWNER_ADDRESS, 'pending');
        const updateTx = questContract.methods.updateEligibility([user], [true]);
        const gas = await updateTx.estimateGas({ from: process.env.OWNER_ADDRESS });
        const data = updateTx.encodeABI();

        const tx = {
            to: process.env.QUEST_CONTRACT_ADDRESS,
            data,
            gas,
            from: process.env.OWNER_ADDRESS,
            nonce: nonce
        };

        const signedTx = await web3.eth.accounts.signTransaction(tx, process.env.PRIVATE_KEY);
        await web3.eth.sendSignedTransaction(signedTx.rawTransaction);

        console.log(`Eligibility updated for user: ${user}`);
    } catch (error) {
        console.error(`Error updating eligibility for user ${user}:`, error);
    }
}

// Initialiser et commencer à surveiller les nouveaux contrats NFT
initialize().then(() => {
    console.log('Initialization complete. Monitoring for new NFT contracts...');
    setInterval(checkNewContracts, 60000); // Vérification toutes les minutes
}).catch(err => {
    console.error('Initialization error:', err);
});
