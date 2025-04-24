// Import Solana packages
import { Raydium, TxVersion, parseTokenAccountResp } from '@raydium-io/raydium-sdk-v2';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
// import bs58 from 'bs58';

// Load environment variables
import dotenv from 'dotenv';
dotenv.config();

// Load the private key from environment variables in hex format
const privateKeyHex = process.env.WALLET_PRIVATE_KEY; // Ensure this is your hex format private key
if (!privateKeyHex) {
  throw new Error("WALLET_PRIVATE_KEY is not set in the environment file.");
}

// Decode the private key and initialize the wallet
export const owner = Keypair.fromSecretKey(Buffer.from(privateKeyHex, 'hex'));

// Define the RPC connection
export const connection = new Connection(process.env.RPC_URL || clusterApiUrl('mainnet-beta'));


// Transaction version
export const txVersion = TxVersion.V0; // or TxVersion.LEGACY


// Cluster setup
const cluster = 'mainnet'; // 'mainnet' | 'devnet'


// SDK instance
let raydium;

// Initialize the Raydium SDK
export const initSdk = async (params = { loadToken: false }) => {
    if (raydium) return raydium;
  
    if (connection.rpcEndpoint === clusterApiUrl('mainnet-beta')) {
      console.warn('Using free RPC node might cause unexpected errors. It is strongly recommended to use a paid RPC node.');
    }
  
    console.log(`Connecting to RPC ${connection.rpcEndpoint} in ${cluster}`);
    
    raydium = await Raydium.load({
      owner,
      connection,
      cluster,
      disableFeatureCheck: true,
      disableLoadToken: !params.loadToken,
      blockhashCommitment: 'finalized',
    });
  
    return raydium;
  };

// Fetch token account data for the wallet
export const fetchTokenAccountData = async () => {
    const solAccountResp = await connection.getAccountInfo(owner.publicKey);
    const tokenAccountResp = await connection.getTokenAccountsByOwner(owner.publicKey, { programId: TOKEN_PROGRAM_ID });
    const token2022Req = await connection.getTokenAccountsByOwner(owner.publicKey, { programId: TOKEN_2022_PROGRAM_ID });
  
    const tokenAccountData = parseTokenAccountResp({
      owner: owner.publicKey,
      solAccountResp,
      tokenAccountResp: {
        context: tokenAccountResp.context,
        value: [...tokenAccountResp.value, ...token2022Req.value],
      },
    });
  
    return tokenAccountData;
  };  

// Optional gRPC configuration (if needed)
export const grpcUrl = process.env.GRPC_URL || '';
export const grpcToken = process.env.GRPC_TOKEN || '';

