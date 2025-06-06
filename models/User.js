const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  telegramId: { type: Number, required: true, unique: true },
  name: { type: String, required: true },
  height: { type: Number, required: true },
  weight: { type: Number, required: true },
  age: { type: Number, required: true },
  gender: { type: String, enum: ["Male", "Female"], required: true },
  diet: {
    type: String,
    enum: ["Vegetarian", "Non-Vegetarian", "Vegan"],
    required: true,
  },
  activity: {
    type: String,
    enum: ["Sedentary", "Light", "Moderate", "Heavy"],
    required: true,
  },
  goal: {
    type: String,
    enum: ["Lose weight", "Gain weight", "Maintain weight"],
    required: true,
  },
  bmi: { type: Number },
  calories: { type: Number },
  meals: { type: [String], default: [] },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

userSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

const User = mongoose.model("User", userSchema);

module.exports = User;
