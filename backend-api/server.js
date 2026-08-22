const express = require("express");
const cors = require("cors");
const path = require("path");
const { spawn } = require("child_process");

const app = express();

const PORT = 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Home route
app.get("/", (req, res) => {
    res.json({
        message: "Veriscore Backend API is running",
        status: "success"
    });
});

// Health check
app.get("/api/health", (req, res) => {
    res.json({
        status: "healthy",
        service: "Veriscore Backend API"
    });
});

// Loan prediction API
app.post("/api/predict", (req, res) => {

    const input = req.body.input;

    // Check input
    if (!input) {
        return res.status(400).json({
            success: false,
            error: "Input data is required"
        });
    }

    // Required 13 features
    const requiredFields = [
        "person_age",
        "person_income",
        "person_emp_exp",
        "loan_amnt",
        "loan_int_rate",
        "loan_percent_income",
        "cb_person_cred_hist_length",
        "credit_score",
        "person_gender",
        "person_education",
        "person_home_ownership",
        "loan_intent",
        "previous_loan_defaults_on_file"
    ];

    // Check missing fields
    const missingFields = requiredFields.filter(
        (field) => input[field] === undefined
    );

    if (missingFields.length > 0) {
        return res.status(400).json({
            success: false,
            error: "Missing required fields",
            missingFields: missingFields
        });
    }

    /*
     * For now, Python will handle the actual ONNX prediction.
     * We send the input data to the Python prediction script.
     */

    const pythonScript = path.join(
        __dirname,
        "..",
        "model-pipeline",
        "predict_api.py"
    );

    const pythonProcess = spawn("python", [
        pythonScript,
        JSON.stringify(input)
    ]);

    let output = "";
    let errorOutput = "";

    // Receive Python output
    pythonProcess.stdout.on("data", (data) => {
        output += data.toString();
    });

    // Receive Python errors
    pythonProcess.stderr.on("data", (data) => {
        errorOutput += data.toString();
    });

    // Python process completed
    pythonProcess.on("close", (code) => {

        if (code !== 0) {
            console.error("Python Error:", errorOutput);

            return res.status(500).json({
                success: false,
                error: "Model prediction failed",
                details: errorOutput
            });
        }

        try {

            const predictionResult = JSON.parse(output);

            return res.json({
                success: true,
                modelVersion: "v1",
                prediction: predictionResult
            });

        } catch (error) {

            console.error("Invalid Python response:", output);

            return res.status(500).json({
                success: false,
                error: "Invalid prediction response"
            });
        }
    });
});

// Start server
app.listen(PORT, () => {
    console.log("=================================");
    console.log("VERISCORE BACKEND API");
    console.log("=================================");
    console.log(`Server running on http://localhost:${PORT}`);
    console.log("Health: http://localhost:5000/api/health");
    console.log("Prediction: POST http://localhost:5000/api/predict");
    console.log("=================================");
});