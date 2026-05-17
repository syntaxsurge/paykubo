import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomiclabs/hardhat-truffle5";
require("dotenv").config();

/* -------------------------------------------------------------------------- */
/*                               E N V  V A R S                               */
/* -------------------------------------------------------------------------- */

const PRIVATE_KEY = process.env.PRIVATE_KEY ?? "";
const MORPH_HOODI_RPC_URL = process.env.MORPH_HOODI_RPC_URL ?? "https://rpc-hoodi.morph.network";
const accounts = PRIVATE_KEY ? [PRIVATE_KEY] : [];

/* -------------------------------------------------------------------------- */
/*                               H A R D H A T                                */
/* -------------------------------------------------------------------------- */

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.25",
    settings: {
      evmVersion: "london",
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    morphHoodi: {
      url: MORPH_HOODI_RPC_URL,
      chainId: 2910,
      accounts,
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  typechain: { target: "truffle-v5" },
};

export default config;
