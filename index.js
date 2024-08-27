const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const port = process.env.PORT || 5000;

const app = express();

//middleware
app.use(cors());
app.use(express.json());

// ------------------ VERIFY JWT-------------------
function verifyJwt(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send("unauthorized access");
  }
  const token = authHeader.split(" ")[1];

  jwt.verify(token, process.env.SECRET, function (err, decoded) {
    if (err) {
      res.status(403).send("unauthorized access");
    }
    req.decoded = decoded;
    next();
  });
}

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.jmebqdy.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();
    await client.db("shoeResale").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );

    // -------------------------------- COLLECTIONS -----------------------------------------------------------------

    const shoeCollection = client.db("shoeResale").collection("AllShoes");
    const advertiseCollection = client
      .db("shoeResale")
      .collection("advertisedProducts");
    const catCollection = client.db("shoeResale").collection("shoeCategories");
    const bookingCollection = client.db("shoeResale").collection("bookings");
    const userCollection = client.db("shoeResale").collection("users");

    // --------------------------------------------- VERIFY ADMIN FUNCTION ------------------------------------------

    const verifyAdmin = async (req, res, next) => {
      const decodedEmail = req.decoded.email;
      const query = { email: decodedEmail };
      const user = await usersCollection.findOne(query);
      if (user?.role !== "admin") {
        return res.status(403).send("Unauthorized access");
      }
      next();
    };

    const verifySeller = async (req, res, next) => {
      const decodedEmail = req.decoded.email;
      const query = { email: decodedEmail };
      const user = await userCollection.findOne(query);
      if (user?.user_type !== "Seller") {
        return res.status(403).send("Unauthorized access");
      }
      next();
    };

    // -------------------------------------------- PAYMENT API ------------------------------------------------------
    // app.post("/create-payment-intent", async (req, res) => {
    //   const booking = req.body;
    //   const price = booking.price;
    //   const amount = price * 100;

    //   const paymentIntent = await stripe.paymentIntents.create({
    //     currency: "usd",
    //     amount: amount,
    //     payment_method_types: ["card"],
    //   });
    //   res.send({
    //     clientSecret: paymentIntent.client_secret,
    //   });
    // });
    // app.post("/payment", async (req, res) => {
    //   const payment = req.body;
    //   const result = await paymentCollection.insertOne(payment);
    //   res.send(result);
    // });

    // ---------------------------------------------JWT TOKEN---------------------------------------------------------
    app.get("/jwt", async (req, res) => {
      const email = req.query.email;
      const response = await usersCollection.find({ email: email });
      if (response) {
        const token = jwt.sign({ email }, process.env.SECRET, {
          expiresIn: "2d",
        });
        return res.send({ accessToken: token });
      }
      res.status(403).send({ accessToken: "" });
    });

    // --------------------------------------- Categories API ---------------------------------------------------

    app.get("/categories", async (req, res) => {
      const result = await catCollection.find({}).toArray();
      res.send(result);
    });

    // ---------------------------------------- SHOE API ---------------------------------------------------------

    app.post("/addProduct", async (req, res) => {
      const newShoe = req.body;
      const result = await shoeCollection.insertOne(newShoe);
      res.send(result);
    });

    app.get("/allShoes", async (req, res) => {
      const query = {};
      const shoeList = await shoeCollection.find(query).toArray();
      res.send(shoeList);
    });
    app.get("/allShoes/:uid", async (req, res) => {
      const uid = req.params.uid;
      const query = { seller_id: uid };
      const options = await shoeCollection.find(query).toArray();
      res.send(options);
    });

    app.get("/allShoes/category/:cat", async (req, res) => {
      const cat = req.params.cat;
      const query = { category: cat };
      const result = await shoeCollection.find(query).toArray();
      res.send(result);
    });

    app.delete("/allShoes/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const result = await shoeCollection.deleteOne(filter);
      res.send(result);
    });

    // ---------------------------------------------------- ADVERTISED PRODUCTS -------------------------------------

    app.post("/advertise", async (req, res) => {
      const newShoe = req.body;
      const result = await advertiseCollection.insertOne(newShoe);
      res.send(result);
    });

    app.get("/advertisedProducts", async (req, res) => {
      const query = {};
      const shoeList = await advertiseCollection.find(query).toArray();
      res.send(shoeList);
    });

    app.get("/advertised/:id", async (req, res) => {
      const id = req.params.id;
      const query = { shoe_id: id };
      const shoe = await advertiseCollection.findOne(query);
      const shoeAdvertised = shoe ? "true" : "false";
      res.send(shoeAdvertised);
    });

    // ---------------------------------------------------- BOOKING API -----------------------------------------------

    app.post("/booking", async (req, res) => {
      const newBook = req.body;
      const result = await shoeCollection.insertOne(newBook);
      res.send(result);
    });

    // --------------------------------------------------- USER API -------------------------------------------------

    app.post("/user", async (req, res) => {
      const newUser = req.body;
      const result = await userCollection.insertOne(newUser);
      res.send(result);
    });

    app.get("/user/admin/:email", async (req, res) => {
      const email = req.params.email;
      const user = await userCollection.findOne({ user_email: email });
      const result = { isAdmin: user?.user_type === "admin" };
      res.send(result);
    });

    app.get("/user/seller/:email", async (req, res) => {
      const email = req.params.email;
      const user = await userCollection.findOne({ user_email: email });
      const result = { isSeller: user?.user_type === "Seller" };
      res.send(result);
    });

    app.put("/user/admin/:id", verifyJwt, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const options = { upsert: true };
      const doc = {
        $set: {
          role: "admin",
        },
      };
      const result = await userCollection.updateOne(filter, doc, options);
      res.send(result);
    });

    app.get("/testRoute", (req, res) => {
      res.send("Test route works!");
    });
  } finally {
  }
}
run().catch(console.dir);

app.get("/", async (req, res) => {
  res.send("shoe resale running here");
});

app.listen(port, () => console.log("shoe resale server"));
