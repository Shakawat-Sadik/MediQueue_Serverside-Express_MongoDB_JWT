//pnpm add express mongodb jose cors dotenv
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { MongoClient, ServerApiVersion, ObjectId } from "mongodb";
import { createRemoteJWKSet, jwtVerify } from "jose";

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

const uri = process.env.MONGODB_URI;
const url = 
    process.env.NODE_ENV === "production" ?
    process.env.CLIENT_URL : 
    "http://localhost:3000"

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const JWKS = createRemoteJWKSet(
  new URL(
    `${url}/api/auth/jwks`
  )
)

const clientUrl = process.env.CLIENT_URL?.replace(/\/$/, "");
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      clientUrl, // your Vercel URL when deployed
    ].filter(Boolean),
    credentials: true, // needed if you send cookies/JWT later
  }),
);
app.use(express.json());

let cacheDB = null;

const connectToDB = async () => {
  if (cacheDB) return cacheDB;

  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    
    cacheDB = await client.db("Mediqueue");
    return cacheDB;
  } catch (e) {
    console.log("Error connecting to MongoDB", e);
  }
  //   finally {
  //     // Ensures that the client will close when you finish/error
  //     // await client.close();
  //   }
};

app.get("/", (req, res) => {
  res.json({ message: "MediQueue server has started" });
});

app.get("/doctors", async (req, res) => {
  try {
    const db = await connectToDB();
    const doctorsCol = db.collection("doctors");
    const { sort, order, limit, search, specialty } = req.query;

    const filter = {};

    if (search) {
      filter.name = { $regex: search, $options: "i" };
    }

    if (specialty) {
      filter.specialty = specialty;
    }

    // ── Build the sort ──
    // let sortObj = {};
    // if (sort) {
    //   let direction = order === "asc" ? 1 : -1
    //   switch (sort) {
    //     case "name":
    //       sortObj = {slug: direction}
    //       break;
    //     case "experience":
    //       sortObj = {slug: direction}
    //       break;
    //     case "fee":
    //       sortObj = {slug: direction}
    //       break;
    //     case "rating":
    //       sortObj = {slug: direction}
    //       break;

    //   }
    // }
    const sortObj = {};
    if (sort) {
      const direction = order === "desc" ? -1 : 1; // Now standard default is ascending (1)

      if (sort === "name") sortObj.slug = direction;
      if (sort === "experience") sortObj.experience = direction;
      if (sort === "rating") sortObj.rating = direction;
      if (sort === "fee") sortObj.fee = direction;
    }

    const limitNum = limit ? parseInt(limit, 10) : 0;

    const result = await doctorsCol
      .find(filter)
      .limit(limitNum)
      .sort(sortObj)
      .toArray();

    res.status(200).json({
      success: true,
      message: `Doctors info are loaded successfully`,
      result,
    });
  } catch (e) {
    res.status(500).json({
      success: false,
      message: `Couldn't load the data because of this error`,
      error: e.message,
    });
  }
});

app.get("/doctors/:slug", async (req, res) => {

  try {
    const db = await connectToDB();
    const doctorsCol = db.collection("doctors");
    const { slug } = req.params;
    const result = await doctorsCol.findOne({ slug });

    if (!result) return res.status(404).json({ success: false, message: "Doctor not found" });
    res.status(200).json({ success: true, message: "Doctors info are loaded successfully", result });
  } catch (e) {
    res.status(500).json({ success: false, message: "Couldn't load the data because of this error", error: e.message });
  }
});

const verifyToken = async (req, res, next) => {

  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ success: false, error: "Unauthorized entry is intercepted" });
    }
    
    const token = authHeader.split(" ")[1];

    try {
      const { payload } = await jwtVerify(token, JWKS);
      // so your downstream routes can use it (e.g., req.user.id)
      req.user = payload; 
      
      // const x = JSON.stringify(payload, null, 2);
      // 5. Call next() to pass control to the actual route handler
      // console.log(x);
      next();

    } catch (e) {
      return res.status(403).json({ success: false, error: e.message });
    }
  } catch (e){
    return res.status(401).json({ success: false, error: e.message });
  }
}


app.get("/appointments", verifyToken, async (req, res) => {

  if (!req.headers.authorization) {
    return res.status(402).json({ success: false, error: "Unauthorized entry is intercepted" });
  }

  try {
    const db = await connectToDB();
    const appointmentCol = db.collection("appointments")
    
    const { email } = req.query;
    const filter = {};
    if (email) {
      filter.userEmail = email;
    }

    const result = await appointmentCol.find(filter).sort({ createdAt: -1 }).toArray();
    
    res.status(200).json({ success: true, message: "Loaded all appointments", result });
  } catch (e) {
    res.status(500).json({ success: false, message: "Couldn't load the appointment data", error: e.message });
  }
});

app.get("/appointments/:id", verifyToken, async (req, res) => {

  if (!req.headers.authorization) {
    return res.status(402).json({ success: false, error: "Unauthorized entry is intercepted" });
  }

  try {
    const db = await connectToDB();
    const appointmentCol = db.collection("appointments");
    const { id } = req.params;
    const result = await appointmentCol.findOne({ _id: new ObjectId(id) });

    if (!result) return res.status(404).json({ success: false, message: "Appointment not found" });
    res.status(200).json({ success: true, message: "Appointment loaded successfully", result });
  } catch (e) {
    res.status(500).json({ success: false, message: "Couldn't load the data because of this error", error: e.message });
  }
});

app.post("/appointments", verifyToken, async (req, res) => {

  if (!req.headers.authorization) {
    return res.status(402).json({ success: false, error: "Unauthorized entry is intercepted" });
  }

  try {
    const db = await connectToDB();
    const appointmentCol = db.collection("appointments");
    const newBooking = req.body;
    newBooking.createdAt = new Date();
    newBooking.status = newBooking.status || "Confirmed";
    const result = await appointmentCol.insertOne(newBooking);
    res.status(201).json({ success: true, message: "Appointment booked successfully!", insertedId: result.insertedId });
  } catch (e) {
    res.status(500).json({ success: false, message: "Couldn't process the appointment", error: e.message });
  }
});

app.patch("/appointments/:id", verifyToken, async (req, res) => {

  if (!req.headers.authorization) {
    return res.status(402).json({ success: false, error: "Unauthorized entry is intercepted" });
  }

  try {
    const db = await connectToDB();
    const appointmentCol = db.collection("appointments");
    const { id } = req.params;

    const allowedFields = ["patientName", "gender", "phone", "appointmentDate", "appointmentTime", "notes"];
    const updateData = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) updateData[field] = req.body[field];
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ success: false, message: "No valid fields provided for update" });
    }

    const result = await appointmentCol.updateOne({ _id: new ObjectId(id) }, { $set: updateData });

    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: "Appointment not found" });
    }
    res.status(200).json({ success: true, message: "Appointment updated successfully", result });
  } catch (e) {
    res.status(500).json({ success: false, message: "Couldn't update the appointment", error: e.message });
  }
});

app.delete("/appointments/:id", verifyToken, async (req, res) => {
  
  if (!req.headers.authorization) {
    return res.status(402).json({ success: false, error: "Unauthorized entry is intercepted" });
  }

  try {
    const db = await connectToDB();
    const appointmentCol = db.collection("appointments");
    const { id } = req.params;
    const result = await appointmentCol.deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return res.status(404).json({ success: false, message: "Appointment not found" });
    }
    res.status(200).json({ success: true, message: "Appointment deleted successfully", result });
  } catch (e) {
    res.status(500).json({ success: false, message: "Couldn't cancel your booking", error: e.message });
  }
});

app.post("/reviews", verifyToken, async (req, res) => {

  if (!req.headers.authorization) {
    return res.status(402).json({ success: false, error: "Unauthorized entry is intercepted" });
  }

  try {
    const db = await connectToDB();
    const doctorsCol = db.collection("doctors");
    const reviewData = req.body;

    reviewData.createdAt = new Date();

    // 1. Push the review into the doctor's reviews array
    const updateResult = await doctorsCol.updateOne(
      { slug: reviewData.doctorSlug },
      { $push: { reviews: reviewData } }
    );

    if (updateResult.matchedCount === 0) {
      return res.status(404).json({ success: false, message: "Doctor not found" });
    }

    // 2. Recalculate the doctor's average rating
    const doctor = await doctorsCol.findOne({ slug: reviewData.doctorSlug });
    const totalRating = doctor.reviews.reduce((sum, r) => sum + r.rating, 0);
    const avgRating = Math.round((totalRating / doctor.reviews.length) * 10) / 10;

    await doctorsCol.updateOne(
      { slug: reviewData.doctorSlug },
      { $set: { rating: avgRating } }
    );

    res.status(201).json({ success: true, message: "Review added successfully!" });
  } catch (e) {
    res.status(500).json({ success: false, message: "Couldn't add review", error: e.message });
  }
});


if (process.env.NODE_ENV !== "production") {
  app.listen(port, () => {
    console.log(`Server is running at port:${port}`);
  });
}

export default app;

/*
Vercel initiates a serverless container. This containers code reading flow goes one way, doesn't wait for a nested awaited route definition or nested await functions inside the body of `run` function to return a result, and as soon as the code is read to the end, the undiscovered result remains as null, the code reading finishes and the container shuts down completely. For example: when I'm requesting the "/doctors" url, the run function is busy connecting to the server instance to mongodb. So the request hits the wall, and all the routes remain unregistered, with an unsuccessful 404 code. As soon as the awaited connection is established, the one way code reading flow dashes through all those 404s and reach to the end of code. The containers job is to return with HTTP responses and as much data it can gather meanwhile. Well, because of seeing 404s on every endpoint, the return appears to the end user empty handed.

So all the route definition codes inside the `run` function has to come to the root/module level.
No need to confuse the route endpoints with any other asynchronous functions btw.

# The Timeline
0ms: Vercel starts reading your index.js.
5ms: Express app is created. run() starts. It hits await client.connect(). Execution yields. Vercel reaches the end of the file and exports the app (which currently has zero routes).
50ms: A user requests /doctors.
51ms: Express checks its registry. No routes found. Express immediately sends the HTTP response: 404 Cannot GET /doctors back to the user.
52ms: Vercel sees the HTTP response was sent. The user's browser displays the error. That specific request is permanently closed.
...
500ms: MongoDB finally connects. The run() function resumes and registers the routes.

What happens to the request? It's already dead. It got its 404 450 milliseconds ago. The code doesn't "dash through" the 404; the 404 was a message sent to the client, and the connection was closed.

However...
If the user refreshes their browser after the 500ms mark, the second request will hit the server. By now, run() has finished, the routes are registered, and the request will succeed.

But in a serverless environment, Vercel often spins down the container after that first 404 because it thinks the job is done. So the container dies before run() ever finishes.



  */
