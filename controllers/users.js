const { MongoClient } = require("mongodb");
const { validateAzureJWT } = require("./tokenValidator");
const dotenv = require("dotenv");
dotenv.config();

const client = new MongoClient(process.env.MONGO_URI);

client
  .connect()
  .then(() => console.log("Connected"))
  .catch((err) => console.log(err));

const database = client.db("Avatar");

const usersDoc = database.collection("Users");

const getUsers = async (req, res) => {
  try {
    if (!validateAzureJWT(req)) {
      res.status(401);
      throw new Error("Invalid authorization");
    }
    const result = await usersDoc.find({}).toArray();
    res.status(200).json(result);
  } catch (err) {
    res.json({ error: err.message });
  }
};

const getAnUser = async (req, res) => {
  const emailToSearch = req.params.email;
  try {
    if (!validateAzureJWT(req)) {
      res.status(401);
      throw new Error("Invalid authorization");
    } else if (!emailToSearch) {
      res.status(400);
      throw new Error("Send an email to search the user");
    }

    const regexEmail = new RegExp(`^${emailToSearch}`, "i");

    const user = await usersDoc.find({ email: { $regex: regexEmail } }).toArray();

    if (user.length === 0) {
      res.status(404);
      throw new Error("User not found");
    }

    res.json(user);
  } catch (err) {
    res.json({ error: err.message });
  }
};

const postUser = async (req, res) => {
  try {
    if (!validateAzureJWT(req)) {
      res.status(401);
      throw new Error("Invalid authorization");
    }

    const reqData = req.body;

    if (reqData.length === 0 || !("email" in reqData)) {
      res.status(400);
      throw new Error("Invalid data to add the user");
    }
    reqData.wallet = [];
    reqData.balance = 0;
    const newAdded = await usersDoc.insertOne(reqData);

    res.status(201).json(newAdded);
  } catch (err) {
    res.json({ error: err.message });
  }
};

const getUserBalance = async (req, res) => {
  try {
    if (!validateAzureJWT(req)) {
      res.status(401);
      throw new Error("Invalid authorization");
    }

    const emailToSearch = req.params.email;

    const regexEmail = new RegExp(`^${emailToSearch}`, "i");

    updateBalance(regexEmail);

    const user = await usersDoc
      .find({ email: { $regex: regexEmail } })
      .project({ email: 0 })
      .toArray();

    if (user.length === 0) {
      res.status(404);
      throw new Error("User not found");
    }

    res.json(user);
  } catch (err) {
    res.json({ error: err.message });
  }
};

const updateBalance = async (emailToSearch) => {
  const cryptosDoc = database.collection("Cryptos");
  const recentCryptos = await cryptosDoc
    .find({})
    .project({ _id: 0, date: 1, cryptocurrencies: 1 })
    .sort({ date: -1 })
    .limit(1)
    .toArray();

  const userWallet = await usersDoc
    .find({ email: { $regex: emailToSearch } })
    .project({ email: 0, _id: 0, balance: 0 })
    .toArray();

  while (!recentCryptos && !userWallet) {} // loop to wait until the database return the query result

  let newBalance = 0;
  let wallet = userWallet[0].wallet;
  let updateWallet = userWallet[0].wallet;
  let actualValues = recentCryptos[0].cryptocurrencies;

  for (let i = 0; i < wallet.length; i++) {
    for (let j = 0; j < actualValues.length; j++) {
      if (actualValues[j].name == wallet[i].crypto && !isNaN(parseInt(wallet[i].amount))) {
        let calculation = actualValues[j].value * wallet[i].amount;
        newBalance += calculation;
        updateWallet[i].value = calculation;
        updateWallet[i].unitPrice = actualValues[j].value;
        break;
      }
    }
  }

  try {
    const user = await usersDoc.findOneAndUpdate(
      { email: { $regex: emailToSearch } },
      { $set: { wallet: updateWallet, balance: newBalance } },
      { returnOriginal: false }
    );
    while (!user) {} // loop to make the funtion wait until the database update the document of the user
  } catch (err) {
    console.error(`Something went wrong trying to update the user's balance: ${err}\n`);
  }
};

module.exports = { getUsers, getAnUser, getUserBalance };
