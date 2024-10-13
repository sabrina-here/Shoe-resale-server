const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const port = process.env.PORT || 5000;

const stripe = require("stripe")(`${process.env.STRIPE_SECRET}`);

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

  jwt.verify(token, process.env.TOKEN_SECRET, function (err, decoded) {
    if (err) {
      return res.status(403).send("unauthorized access");
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
    const paymentCollection = client.db("shoeResale").collection("payment");

    // ---------------------------------------------JWT TOKEN---------------------------------------------------------
    app.get("/jwt", async (req, res) => {
      const email = req.query.email;
      const response = await userCollection.findOne({ user_email: email });
      if (response) {
        const token = jwt.sign({ email }, process.env.TOKEN_SECRET, {
          expiresIn: "2d",
        });
        return res.send({ accessToken: token });
      }
      res.status(403).send({ accessToken: "" });
    });

    // --------------------------------------------- VERIFY ADMIN FUNCTION ------------------------------------------

    const verifyAdmin = async (req, res, next) => {
      const decodedEmail = req.decoded.email;
      const query = { user_email: decodedEmail };
      const user = await userCollection.findOne(query);
      if (user?.user_type !== "admin") {
        return res.status(403).send("Unauthorized access");
      }
      next();
    };

    const verifySeller = async (req, res, next) => {
      const decodedEmail = req.decoded.email;
      const query = { user_email: decodedEmail };
      const user = await userCollection.findOne(query);
      if (user?.user_type !== "Seller") {
        return res.status(403).send("Unauthorized access");
      }
      next();
    };

    // -------------------------------------------- PAYMENT API ------------------------------------------------------
    app.post("/create-payment-intent", async (req, res) => {
      const booking = req.body;
      const price = booking.shoe_price;
      const amount = price * 100;
      console.log("here: ", booking);

      const paymentIntent = await stripe.paymentIntents.create({
        currency: "usd",
        amount: amount,
        payment_method_types: ["card"],
      });
      console.log(paymentIntent.client_secret);
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });
    app.post("/payment", async (req, res) => {
      const payment = req.body;
      const paymentResult = await paymentCollection.insertOne(payment);

      const shoeId = payment.shoe_id;

      const del_shoe_col_res = await shoeCollection.deleteOne({
        _id: new ObjectId(shoeId),
      });
      const del_book_col_res = await bookingCollection.deleteOne({
        shoe_id: shoeId,
      });
      const del_adv_col_res = await advertiseCollection.deleteOne({
        shoe_id: shoeId,
      });
      res.send({
        paymentResult,
        del_adv_col_res,
        del_book_col_res,
        del_shoe_col_res,
      });
    });

    // --------------------------------------- Categories API ---------------------------------------------------

    app.get("/categories", async (req, res) => {
      const result = await catCollection.find({}).toArray();
      res.send(result);
    });

    // ---------------------------------------- SHOE API ---------------------------------------------------------

    app.post("/addProduct", verifyJwt, verifySeller, async (req, res) => {
      const newShoe = req.body;
      const result = await shoeCollection.insertOne(newShoe);
      res.send(result);
    });

    app.get("/allShoes", async (req, res) => {
      const query = {};
      const shoeList = await shoeCollection.find(query).toArray();
      res.send(shoeList);
    });
    app.get("/allShoes/:uid", verifyJwt, verifySeller, async (req, res) => {
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

    app.delete("/allShoes/:id", verifyJwt, verifySeller, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const result = await shoeCollection.deleteOne(filter);
      res.send(result);
    });

    // ---------------------------------------------------- ADVERTISED PRODUCTS -------------------------------------

    app.post("/advertise", verifyJwt, verifySeller, async (req, res) => {
      const newShoe = req.body;
      const result = await advertiseCollection.insertOne(newShoe);
      res.send(result);
    });

    app.get("/advertisedProducts", async (req, res) => {
      const query = {};
      const shoeList = await advertiseCollection.find(query).toArray();
      res.send(shoeList);
    });

    app.get("/advertised/:id", verifyJwt, verifySeller, async (req, res) => {
      const id = req.params.id;
      const query = { shoe_id: id };
      const shoe = await advertiseCollection.findOne(query);
      const shoeAdvertised = shoe ? "true" : "false";
      res.send(shoeAdvertised);
    });

    // ---------------------------------------------------- BOOKING API -----------------------------------------------

    app.post("/booking", verifyJwt, async (req, res) => {
      const newBook = req.body;
      const result = await bookingCollection.insertOne(newBook);
      res.send(result);
    });

    app.get("/booking/:uid", verifyJwt, async (req, res) => {
      const uid = req.params.uid;
      const result = await bookingCollection
        .find({ customer_id: uid })
        .toArray();
      res.send(result);
    });

    app.get("/booking/payment/:id", async (req, res) => {
      const id = req.params.id;
      const result = await bookingCollection.findOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    app.delete("/booking/:id", verifyJwt, async (req, res) => {
      const id = req.params.id;
      const result = await bookingCollection.deleteOne({
        _id: new ObjectId(id),
      });
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

    app.get("/admin/allSellers", verifyJwt, verifyAdmin, async (req, res) => {
      const result = await userCollection
        .find({ user_type: "Seller" })
        .toArray();
      res.send(result);
    });

    app.get("/admin/allBuyers", verifyJwt, verifyAdmin, async (req, res) => {
      const result = await userCollection
        .find({ user_type: "Customer" })
        .toArray();
      res.send(result);
    });

    app.delete(
      "/admin/deleteSeller/:uid",
      verifyJwt,
      verifyAdmin,
      async (req, res) => {
        const uid = req.params.id;

        // --- deleting all shoes of this seller from all shoes collection
        const query = { seller_id: uid };
        const options = await shoeCollection.deleteMany(query);

        // ----- deleting the seller from user database
        const filter = { user_uid: uid };
        const result = await userCollection.deleteOne(filter);
        res.send(result);
      }
    );

    app.delete(
      "/admin/deleteBuyer/:uid",
      verifyJwt,
      verifyAdmin,
      async (req, res) => {
        const uid = req.params.id;
        const filter = { user_uid: uid };
        const result = await userCollection.deleteOne(filter);
        res.send(result);
      }
    );

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
