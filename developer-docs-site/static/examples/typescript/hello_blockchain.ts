// Copyright (c) The Aptos Foundation
// SPDX-License-Identifier: Apache-2.0

import assert from "assert";
import fs from "fs";
import { NODE_URL, FAUCET_URL, accountBalance } from "./first_transaction";
import { AptosAccount, TxnBuilderTypes, BCS, MaybeHexString, HexString, AptosClient, FaucetClient } from "aptos";

const readline = require("readline").createInterface({
  input: process.stdin,
  output: process.stdout,
});

//:!:>section_1
const client = new AptosClient(NODE_URL);
const faucetClient = new FaucetClient(NODE_URL, FAUCET_URL);

/** Publish a new module to the blockchain within the specified account */
export async function publishModule(accountFrom: AptosAccount, moduleHex: string): Promise<string> {
  const moduleBundlePayload = new TxnBuilderTypes.TransactionPayloadModuleBundle(
    new TxnBuilderTypes.ModuleBundle([new TxnBuilderTypes.Module(new HexString(moduleHex).toUint8Array())]),
  );

  const [{ sequence_number: sequenceNumber }, chainId] = await Promise.all([
    client.getAccount(accountFrom.address()),
    client.getChainId(),
  ]);

  const rawTxn = new TxnBuilderTypes.RawTransaction(
    TxnBuilderTypes.AccountAddress.fromHex(accountFrom.address()),
    BigInt(sequenceNumber),
    moduleBundlePayload,
    1000n,
    1n,
    BigInt(Math.floor(Date.now() / 1000) + 10),
    new TxnBuilderTypes.ChainId(chainId),
  );

  const bcsTxn = AptosClient.generateBCSTransaction(accountFrom, rawTxn);
  const transactionRes = await client.submitSignedBCSTransaction(bcsTxn);

  return transactionRes.hash;
}
//<:!:section_1
//:!:>section_2
/** Retrieve the resource Message::MessageHolder::message */
async function getMessage(contractAddress: HexString, accountAddress: MaybeHexString): Promise<string> {
  try {
    const resource = await client.getAccountResource(
      accountAddress,
      `${contractAddress.toString()}::message::MessageHolder`,
    );
    return (resource as any).data["message"];
  } catch (_) {
    return "";
  }
}

//<:!:section_2
//:!:>section_3
/**  Potentially initialize and set the resource Message::MessageHolder::message */
async function setMessage(contractAddress: HexString, accountFrom: AptosAccount, message: string): Promise<string> {
  const scriptFunctionPayload = new TxnBuilderTypes.TransactionPayloadEntryFunction(
    TxnBuilderTypes.EntryFunction.natural(
      `${contractAddress.toString()}::message`,
      "set_message",
      [],
      [BCS.bcsSerializeStr(message)],
    ),
  );

  const [{ sequence_number: sequenceNumber }, chainId] = await Promise.all([
    client.getAccount(accountFrom.address()),
    client.getChainId(),
  ]);

  const rawTxn = new TxnBuilderTypes.RawTransaction(
    TxnBuilderTypes.AccountAddress.fromHex(accountFrom.address()),
    BigInt(sequenceNumber),
    scriptFunctionPayload,
    1000n,
    1n,
    BigInt(Math.floor(Date.now() / 1000) + 10),
    new TxnBuilderTypes.ChainId(chainId),
  );

  const bcsTxn = AptosClient.generateBCSTransaction(accountFrom, rawTxn);
  const transactionRes = await client.submitSignedBCSTransaction(bcsTxn);

  return transactionRes.hash;
}
//<:!:section_3

/** run our demo! */
async function main() {
  assert(process.argv.length == 3, "Expecting an argument that points to the helloblockchain module");

  // Create two accounts, Alice and Bob, and fund Alice but not Bob
  // let alicePrivateKey, bobPrivateKey = null;

  // 0x17c8af5adf0b57ad1fa15e74a9f1d145e73978ad33117d35ccc1ef125ee4909e
  let alicePrivateKey = Buffer.from('2ef54d3dc120df392f597e493f0a2b112562298f3f24401cac27ef291b5b97e94e0ddc2eab2ae48d6f97e72fb67acd13fba589d84e07b4fed77e70886a876b40', 'hex');
  // 0xcb72902b053244e631b6777989ff86d9025600bad4830c99a75e4c6fc4d10d50
  let bobPrivateKey = Buffer.from('d5c73252f3c546a8e5df5143598d7d84c5282c426b533495d07b1f1cbe7f168b0054c569aa64ee09e3344f340a707deb17cf2d0eb1d214fa4260e4a3ba443555', 'hex');
  
  const alice = new AptosAccount(alicePrivateKey);
  const bob = new AptosAccount(bobPrivateKey);

  console.log("\n=== Addresses ===");
  console.log(`Alice: ${alice.address()}`);
  console.log(`Bob: ${bob.address()}`);

  await faucetClient.fundAccount(alice.address(), 5_000);
  await faucetClient.fundAccount(bob.address(), 5_000);

  console.log("\n=== Initial Balances ===");
  console.log(`Alice: ${alice.address()} Key Seed: ${Buffer.from(alice.signingKey.secretKey).toString("hex")}`);
  console.log(`Bob: ${bob.address()} Key Seed: ${Buffer.from(bob.signingKey.secretKey).toString("hex")}`);

  await new Promise<void>((resolve) => {
    readline.question(
      "Update the module with Alice's address, build, copy to the provided path, and press enter.",
      () => {
        resolve();
        readline.close();
      },
    );
  });
  const modulePath = process.argv[2];
  const moduleHex = fs.readFileSync(modulePath).toString("hex");

  console.log("\n=== Testing Alice ===");
  console.log("Publishing...");

  let txHash = await publishModule(alice, moduleHex);
  await client.waitForTransaction(txHash);
  console.log(`Initial value: ${await getMessage(alice.address(), alice.address())}`);

  console.log('Setting the message to "Hello, Blockchain"');
  txHash = await setMessage(alice.address(), alice, "Hello, Blockchain");
  await client.waitForTransaction(txHash);
  console.log(`New value: ${await getMessage(alice.address(), alice.address())}`);

  console.log("\n=== Testing Bob ===");
  console.log(`Initial value: ${await getMessage(alice.address(), bob.address())}`);
  console.log('Setting the message to "Hello, Blockchain"');
  txHash = await setMessage(alice.address(), bob, "Hello, Blockchain");
  await client.waitForTransaction(txHash);
  console.log(`New value: ${await getMessage(alice.address(), bob.address())}`);
}

if (require.main === module) {
  main().then((resp) => console.log(resp));
}
