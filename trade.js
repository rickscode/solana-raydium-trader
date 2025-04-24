// Import Required Libraries
import { Transaction, VersionedTransaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { NATIVE_MINT } from '@solana/spl-token';
import axios from 'axios';
import { connection, owner, fetchTokenAccountData } from './config.js';
import { API_URLS } from '@raydium-io/raydium-sdk-v2';

// Fetch Latest Valid Token
const fetchLatestValidTokenFromDex = async () => {
    try {
      const response = await axios.get('https://api.dexscreener.com/token-profiles/latest/v1');
      if (response.data && Array.isArray(response.data)) {
        for (const token of response.data) {
          if (token.chainId === 'solana') {
            console.log('Fetched latest Solana token:', token);
            const isValid = await validateToken(token);
            if (isValid) {
              console.log(`Token ${token.tokenAddress} passed all checks.`);
              return token.tokenAddress;
            } else {
              console.log(`Token ${token.tokenAddress} did not meet the criteria. Skipping.`);
            }
          }
        }
      }
      console.error('No valid Solana token found.');
    } catch (error) {
      console.error('Error fetching latest token from Dex Screener:', error.message);
    }
    return null;
  };
  
// Validate Token
const validateToken = async (token, config = {}) => {
    const { tokenAddress, name = '', symbol = '' } = token;
  
    // Configurable thresholds
    const {
      minAgeInMinutes = 10, // Ensure token is at least 5 minutes old
      maxAgeInMinutes = 6000, // Ensure token is not older than 6 minutes
      minLiquidityUsd = 100,
      minMarketCap = 100,
      minMarketCapToFdvRatio = 0.5,
      maxRiskScore = 1,
    } = config;

    // very high risk

    try {
        // Fetch token data from DexScreener & RugCheck in parallel
        const [dexResponse, rugCheckResponse] = await Promise.all([
          axios.get(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`),
          axios.get(`https://api.rugcheck.xyz/v1/tokens/${tokenAddress}/report/summary`, {
            headers: { Accept: 'application/json' },
          }).catch(() => null), // Handle RugCheck API failure gracefully
        ]);
        // Check if token is tradable on raydium
        const pairs = dexResponse.data?.pairs || [];
        const raydiumPair = pairs.find((pair) => pair.dexId === 'raydium');
    
        if (!raydiumPair) {
          console.warn(`No Raydium pair found for token ${tokenAddress}`);
          return false;
        }

        // Validate token age
        const ageInMinutes = (Date.now() - raydiumPair.pairCreatedAt) / (1000 * 60);
        if (ageInMinutes < minAgeInMinutes) {
        console.warn(`Token ${tokenAddress} is too new (<${minAgeInMinutes} min). Skipping.`);
        return false;
        }
        if (ageInMinutes > maxAgeInMinutes) {
        console.warn(`Token ${tokenAddress} is too old (>${maxAgeInMinutes} min). Skipping.`);
        return false;
        }

        // Validate liquidity
        const liquidity = raydiumPair.liquidity?.usd || 0;
        if (liquidity < minLiquidityUsd) {
        console.warn(`Token ${tokenAddress} has insufficient liquidity. Skipping.`);
        return false;
        }

        // Validate market cap & FDV
        const marketCap = raydiumPair.marketCap || 0;
        const fdv = raydiumPair.fdv || 0;
        if (marketCap < minMarketCap || marketCap / fdv < minMarketCapToFdvRatio) {
        console.warn(`Token ${tokenAddress} fails Market Cap or FDV ratio validation. Skipping.`);
        return false;
        }

        // Validate risk score (if RugCheck API responded)
        if (rugCheckResponse?.data) {
            const riskScore = rugCheckResponse.data.score;
            if (riskScore > maxRiskScore) {
            console.warn(`Token ${tokenAddress} has a high risk score (${riskScore}). Skipping.`);
            return false;
            }
        }
  
      console.log(`✅ Token ${tokenAddress} passed validation.`);
      return true;
    } catch (error) {
      console.error(`Error validating token ${tokenAddress}:`, error.message);
      return false;
    }
  };

// Fetch SOL Price in USD

const fetchSOLPrice = async () => {
    try {
      const { data } = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
      const solPrice = data.solana.usd;
      console.log(`Current SOL price: $${solPrice}`);
      return solPrice;
    } catch (error) {
      console.error('Error fetching SOL price:', error.message);
      throw new Error('Failed to fetch SOL price');
    }
  };

// Fetch Token Price from Dex

const fetchTokenPriceFromDex = async (tokenAddress) => {
    try {
      const response = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`);
      const pairs = response.data?.pairs;
  
      if (!pairs || pairs.length === 0) {
        console.error(`No pairs found for token: ${tokenAddress}`);
        return null;
      }
  
      const validPair = pairs.find((pair) => pair.chainId === 'solana' && pair.dexId === 'raydium');
      if (!validPair) {
        console.error(`No valid pair found for token: ${tokenAddress}`);
        return null;
      }
  
      const priceUsd = parseFloat(validPair.priceUsd);
      if (!priceUsd || priceUsd <= 0) {
        console.error(`Invalid USD price for token: ${tokenAddress}`);
        return null;
      }
  
      console.log(`Current price for token ${tokenAddress} from DexScreener: $${priceUsd}`);
      return priceUsd;
    } catch (error) {
      console.error(`Error fetching price for token ${tokenAddress} from DexScreener: ${error.message}`);
      return null;
    }
  };

// Fetch Swap Quote Raydium SDK
const fetchSwapQuote = async (outputMint) => {
    try {
      const solPrice = await fetchSOLPrice();
      const usdAmount = 0.1; // Example USD amount
      const solAmount = usdAmount / solPrice;
      const amountInLamports = Math.floor(solAmount * 1e9);
      const slippage = 0.5;
      const txVersion = 'V0';
  
      console.log(`Purchasing $${usdAmount} worth of SOL (${solAmount} SOL, ${amountInLamports} lamports)`);
  
      const { data: swapResponse } = await axios.get(
        `${API_URLS.SWAP_HOST}/compute/swap-base-in?inputMint=${NATIVE_MINT.toBase58()}&outputMint=${outputMint}&amount=${amountInLamports}&slippageBps=${
          slippage * 100
        }&txVersion=${txVersion}`
      );
  
      if (swapResponse.success) {
        console.log('Swap Quote Response:', JSON.stringify(swapResponse, null, 2));
        return { swapResponse, txVersion, isInputSol: true, isOutputSol: false };
      } else {
        console.error('Failed to fetch swap quote:', swapResponse.msg);
      }
    } catch (error) {
      console.error('Error fetching swap quote:', error.message);
    }
    return null;
  };
  
// Fetch Sell Quote Raydium SDK
const fetchSellQuote = async (inputMint, tokenBalance) => {
    const slippage = 0.5; // Slippage tolerance in %
    const txVersion = 'V0';
    console.log(`Fetching sell quote for ${tokenBalance} tokens of ${inputMint} to SOL...`);
    try {
      const { data: sellResponse } = await axios.get(
        `${API_URLS.SWAP_HOST}/compute/swap-base-in?inputMint=${inputMint}&outputMint=${NATIVE_MINT.toBase58()}&amount=${tokenBalance}&slippageBps=${
          slippage * 100
        }&txVersion=${txVersion}`
      );
  
      if (sellResponse.success) {
        console.log('Sell Quote Response:', JSON.stringify(sellResponse, null, 2));
        return { sellResponse, txVersion, isInputSol: false, isOutputSol: true };
      } else {
        console.error('Failed to fetch sell quote:', sellResponse.msg);
      }
    } catch (error) {
      console.error('Error fetching sell quote:', error.message);
    }
    return null;
  };

// Serialize Swap Transaction Raydium SDK
const serializeSwapTransaction = async (swapResponse, txVersion, isInputSol, isOutputSol, inputTokenAcc, outputTokenAcc) => {
    try {
      const { data: feeData } = await axios.get(`${API_URLS.BASE_HOST}${API_URLS.PRIORITY_FEE}`);
      const computeUnitPriceMicroLamports = String(feeData.data.default.h);
  
      const { data: swapTransactions } = await axios.post(
        `${API_URLS.SWAP_HOST}/transaction/swap-base-in`,
        {
          computeUnitPriceMicroLamports,
          swapResponse,
          txVersion,
          wallet: owner.publicKey.toBase58(),
          wrapSol: isInputSol,
          unwrapSol: isOutputSol,
          inputAccount: isInputSol ? undefined : inputTokenAcc?.toBase58(),
          outputAccount: isOutputSol ? undefined : outputTokenAcc?.toBase58(),
        }
      );
  
      console.log('Serialized Swap Transactions:', JSON.stringify(swapTransactions, null, 2));
      return swapTransactions.data.map((tx) => Buffer.from(tx.transaction, 'base64'));
    } catch (error) {
      console.error('Error serializing transaction:', error.message);
      throw error;
    }
  };

// Deserialize Transactions Raydium SDK
const deserializeTransactions = (serializedTransactions, txVersion) => {
    try {
      const allTransactions = serializedTransactions.map((txBuf) =>
        txVersion === 'V0' ? VersionedTransaction.deserialize(txBuf) : Transaction.from(txBuf)
      );
      console.log(`Deserialized ${allTransactions.length} transactions:`, allTransactions);
      return allTransactions;
    } catch (error) {
      console.error('Error during deserialization:', error.message);
      throw error;
    }
  };

// Sign and Execute Transactions Raydium SDK
const signAndExecuteTransactions = async (transactions, txVersion) => {
    let idx = 0;
    const MAX_RETRIES = 5; // Set the maximum number of retries
  
    for (const transaction of transactions) {
      idx++;
      let txId;
  
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          console.log(`Signing and sending transaction ${idx} (Attempt ${attempt})...`);
          transaction.sign([owner]); // Sign the transaction
  
          // Send transaction and capture the transaction ID
          txId = await connection.sendTransaction(transaction, {
            skipPreflight: true,
            preflightCommitment: 'processed', // Preflight checks with "processed" commitment
          });
  
          console.log(`Transaction sent, txId: ${txId}`);
  
          // Wait for confirmation with an extended timeout
          await connection.confirmTransaction(txId, 'confirmed', 60000); // Wait up to 60 seconds
          console.log(`Transaction ${idx} confirmed, txId: ${txId}`);
  
          break; // Exit the retry loop on success
  
        } catch (error) {
          if (attempt === MAX_RETRIES) {
            console.error(`Transaction ${idx} failed after ${MAX_RETRIES} attempts. txId: ${txId}`);
            continue; // Move to the next transaction after retries are exhausted
          }
  
          if (error.name === 'TransactionExpiredTimeoutError') {
            console.warn(`Transaction ${idx} timed out on attempt ${attempt}. txId: ${txId}`);
            
            try {
              // Fetch the transaction status
              const status = await connection.getTransaction(txId, {
                maxSupportedTransactionVersion: 0, // Specify the maximum supported transaction version
              });
  
              if (status?.meta?.err === null) {
                console.log(`Transaction ${idx} succeeded after timeout on attempt ${attempt}. txId: ${txId}`);
                break; // Exit the retry loop if the transaction eventually succeeds
              } else {
                console.warn(`Transaction ${idx} failed with status error on attempt ${attempt}. txId: ${txId}`);
              }
            } catch (fetchError) {
              console.error(`Failed to fetch transaction status on attempt ${attempt}. Error: ${fetchError.message}`);
            }
          } else {
            console.error(`Error with transaction ${idx} on attempt ${attempt}: ${error.message}`);
          }
  
          // Wait briefly before retrying
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }
    }
  };

// Monitor and Sell Token Raydium SDK
const monitorAndSellToken = async (tokenAddress, usdAmount, outputAmount) => {
    // Convert lamports to tokens (1e9 lamports = 1 token)
    const outputAmountInTokens = outputAmount / 1e9;
  
    if (outputAmountInTokens <= 0) {
      console.error('Output amount is zero or invalid. Exiting...');
      return;
    }
  
    console.log(`Output amount in tokens: ${outputAmountInTokens}`);
  
    // Fetch the current price at the time of purchase from Dex Screener
    const purchasePricePerToken = await fetchTokenPriceFromDex(tokenAddress);
    if (!purchasePricePerToken) {
      console.error('Failed to fetch the initial price from Dex Screener. Exiting...');
      return;
    }
  
    console.log(`Fetched purchase price per token from Dex Screener: $${purchasePricePerToken}`);
  
    // Calculate the target price (% increase)
    const targetPrice = (purchasePricePerToken * 1.01).toFixed(8); // Add % margin with proper precision
    console.log(`Monitoring ${tokenAddress} for a 15% increase...`);
    console.log(`Target price per token: $${targetPrice}`);
  
    while (true) {
      try {
        // Fetch current price from Dex Screener
        const currentPrice = await fetchTokenPriceFromDex(tokenAddress);
  
        if (!currentPrice) {
          console.log('Failed to fetch current price. Retrying in 15 seconds...');
          await new Promise((resolve) => setTimeout(resolve, 15000));
          continue;
        }
  
        console.log(`Current price: $${currentPrice}. Target price: $${targetPrice}`);
  
        if (parseFloat(currentPrice) >= parseFloat(targetPrice)) {
          console.log(`Price target reached! Current price: $${currentPrice}. Initiating sell...`);
  
          // Fetch token accounts and validate balance
          const { tokenAccounts } = await fetchTokenAccountData();
          const tokenBalance = tokenAccounts.find((a) => a.mint.toBase58() === tokenAddress)?.amount || 0;
  
          if (tokenBalance <= 0) {
            console.error('No token balance available for selling. Exiting...');
            return;
          }
  
          console.log(`Token balance available: ${tokenBalance}`);
  
          // Fetch sell quote
          const sellQuote = await fetchSellQuote(tokenAddress, tokenBalance);
          if (!sellQuote) {
            console.error('Failed to fetch sell quote. Retrying...');
            continue;
          }
  
          console.log('Sell quote fetched successfully:', JSON.stringify(sellQuote, null, 2));
  
          const { sellResponse, txVersion } = sellQuote;
          const inputTokenAcc = tokenAccounts.find((a) => a.mint.toBase58() === tokenAddress)?.publicKey;
          const outputTokenAcc = tokenAccounts.find((a) => a.mint.toBase58() === NATIVE_MINT.toBase58())?.publicKey;
  
          // Serialize and execute sell transaction
          const serializedSellTransactions = await serializeSwapTransaction(
            sellResponse,
            txVersion,
            false,
            true,
            inputTokenAcc,
            outputTokenAcc
          );
  
          if (!serializedSellTransactions) {
            console.error('Serialization of sell transaction failed. Retrying...');
            continue;
          }
  
          const deserializedSellTransactions = deserializeTransactions(serializedSellTransactions, txVersion);
  
          try {
            await signAndExecuteTransactions(deserializedSellTransactions, txVersion);
            console.log('Sell transaction completed successfully!');
            break; // Exit loop after successful sell
          } catch (error) {
            console.error('Error during sell transaction execution:', error.message);
            return;
          }
        }
      } catch (error) {
        console.error('Unexpected error in monitorAndSellToken loop:', error.message);
      }
  
      await new Promise((resolve) => setTimeout(resolve, 10000)); // Retry every 10 seconds
    }
  };

// Main Function
const main = async () => {
    let tokenPurchased = false; // Flag to track if a token has been purchased
    let purchasedTokenAddress = null; // Store the address of the purchased token
    let outputAmount = 0; // Store the output amount from the swap
  
    while (true) {
      try {
        if (!tokenPurchased) {
          // Search for a new token only if no token has been purchased yet
          const latestTokenAddress = await fetchLatestValidTokenFromDex();
  
          if (!latestTokenAddress) {
            console.error('No valid token passed validation checks. Retrying in 20 seconds...');
            await new Promise((resolve) => setTimeout(resolve, 20000)); // Wait 20 seconds before retrying
            continue; // Restart the loop
          }
  
          console.log(`Valid token found: ${latestTokenAddress}`);
          const quoteResponse = await fetchSwapQuote(latestTokenAddress);
  
          if (!quoteResponse) {
            console.error('Failed to fetch swap quote. Retrying in 30 seconds...');
            await new Promise((resolve) => setTimeout(resolve, 30000)); // Wait 30 seconds before retrying
            continue; // Restart the loop
          }
  
          const { swapResponse, txVersion } = quoteResponse;
          const { tokenAccounts } = await fetchTokenAccountData();
          const inputTokenAcc = tokenAccounts.find((a) => a.mint.toBase58() === NATIVE_MINT.toBase58())?.publicKey;
          const outputTokenAcc = tokenAccounts.find((a) => a.mint.toBase58() === latestTokenAddress)?.publicKey;
  
          const serializedTransactions = await serializeSwapTransaction(
            swapResponse,
            txVersion,
            true,
            false,
            inputTokenAcc,
            outputTokenAcc
          );
  
          if (serializedTransactions) {
            const deserializedTransactions = deserializeTransactions(serializedTransactions, txVersion);
  
            // Execute the transaction
            await signAndExecuteTransactions(deserializedTransactions, txVersion);
  
            // Store the output amount for monitoring
            outputAmount = parseFloat(swapResponse.data.outputAmount); // Token amount in lamports
  
            // Set the flag to indicate a token has been purchased
            tokenPurchased = true;
            purchasedTokenAddress = latestTokenAddress;
  
            console.log(`Token purchased: ${purchasedTokenAddress}. Starting monitoring...`);
          } else {
            console.error('Serialization failed. Retrying in 30 seconds...');
            await new Promise((resolve) => setTimeout(resolve, 30000)); // Wait 30 seconds before retrying
          }
        } else {
          // Monitor and sell the purchased token
          await monitorAndSellToken(purchasedTokenAddress, 0.3, outputAmount); // Pass the correct purchase price and output amount
        }
      } catch (error) {
        console.error('An unexpected error occurred. Retrying in 30 seconds...', error.message);
        await new Promise((resolve) => setTimeout(resolve, 30000)); // Wait 30 seconds before retrying
      }
    }
  };
    
    // Call the main function
    main().catch((error) => {
      console.error('Unexpected error in the main function:', error.message);
    });
    









