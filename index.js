//pnpm add express mongodb jose cors dotenv
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { MongoClient, ServerApiVersion, ObjectId } from "mongodb";

dotenv.config();

const app = express();
const port = process.env.PORT;

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

app.use(
  cors({
    origin: [
      "http://localhost:3000",
      process.env.CLIENT_URL, // your Vercel URL when deployed
    ].filter(Boolean),
    credentials: true, // needed if you send cookies/JWT later{
    origin: [
      "http://localhost:3000",
      process.env.CLIENT_URL, // your Vercel URL when deployed
    ].filter(Boolean),
    credentials: true, // needed if you send cookies/JWT later
  }),
);
app.use(express.json());

app.get("/", (req, res) => {
  res.json({ message: "MediQueue server has started" });
});

const run = async () => {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("Mediqueue").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );

    const doctorsCol = client.db("Mediqueue").collection("doctors");
    const appointmentCol = client.db("Mediqueue").collection("appointments");

    app.get("/doctors", async (req, res) => {
      try {
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
        const { slug } = req.params;
        console.log(slug);
        const result = await doctorsCol.findOne({
          slug: { $eq: slug },
        });

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

    app.get("/appointments", async (req, res) => {
      try {
        const result = await appointmentCol.find().toArray();

        res
          .status(200)
          .json({ success: true, message: `Loaded all appointments`, result });
      } catch (e) {
        res.status(500).json({
          success: false,
          message: `Couldn't load the appointment data`,
          error: e.message,
        });
      }
    });

    app.get("/appointments/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const result = await appointmentCol.findOne({
          _id: { $eq: new ObjectId(id) },
        });

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

    app.post("/appointments", async (req, res) => {
      try {
        const newBooking = req.body;
        const result = await appointmentCol.insertOne(newBooking);

        res
          .status(200)
          .json({ success: true, message: `Appointment successful`, result });
      } catch (e) {
        res.status(500).json({
          success: false,
          message: `Couldn't process the appointment`,
          error: e.message,
        });
      }
    });

    app.patch("/appointments/:id", async (req, res) => {
      try {
        const { id } = req.params;

        // ✅ Only allow updating these fields
        const allowedFields = [
          "patientName",
          "gender",
          "phone",
          "appointmentDate",
          "appointmentTime",
          "notes",
        ];

        const updateData = {};
        for (const field of allowedFields) {
          if (req.body[field] !== undefined) {
            updateData[field] = req.body[field];
          }
        }

        // If no valid fields to update
        if (Object.keys(updateData).length === 0) {
          return res.status(400).json({
            success: false,
            message: "No valid fields provided for update",
          });
        }

        const result = await appointmentCol.updateOne(
          { _id: new ObjectId(id) },
          { $set: updateData },
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({
            success: false,
            message: "Appointment not found",
          });
        }

        res.status(200).json({
          success: true,
          message: "Appointment updated successfully",
          result,
        });
      } catch (e) {
        res.status(500).json({
          success: false,
          message: "Couldn't update the appointment",
          error: e.message,
        });
      }
    });

    app.delete("/appointments/:id", async (req, res) => {
      try {
        const { id } = req.params;

        const result = await appointmentCol.deleteOne({
          _id: new ObjectId(id),
        });
        if (result.deletedCount === 0) {
          return res.status(404).json({
            message:
              "Something went wrong, couldn't find the data. Look into the MongoDB collection. Or atleast try finding before trying AI suggestion",
          });
        }

        res
          .status(200)
          .json({ success: true, message: `Booking canceled`, result });
      } catch (e) {
        res.status(500).json({
          success: false,
          message: `Couldn't cancel your booking`,
          error: e.message,
        });
      }
    });
  } catch (e) {
    console.log("Error connecting to MongoDB", e);
  }
  //   finally {
  //     // Ensures that the client will close when you finish/error
  //     // await client.close();
  //   }
};

run()
  .then(() => {
    app.listen(port, () => {
      console.log(`Server is running at port:${port}`);
    });
  })
  .catch(console.dir);
