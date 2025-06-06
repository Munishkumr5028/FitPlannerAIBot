require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const express = require("express");
const mongoose = require("mongoose");
const User = require("./models/User");
const { generateDietPlan } = require("./dietLogic");

// Check required env vars
if (!process.env.BOT_TOKEN) {
  console.error("Error: BOT_TOKEN not set in environment variables.");
  process.exit(1);
}
if (!process.env.MONGO_URI) {
  console.error("Error: MONGO_URI not set in environment variables.");
  process.exit(1);
}

// Connect to MongoDB
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB connected successfully"))
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1);
  });

// Initialize bot with polling
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

// Session storage
const sessions = {};
const SESSION_TIMEOUT = 5 * 60 * 1000; // 5 minutes

function resetSession(chatId) {
  sessions[chatId] = { lastActive: Date.now() };
}

function checkSessionTimeout(chatId) {
  const session = sessions[chatId];
  if (!session) return false;
  return Date.now() - (session.lastActive || 0) > SESSION_TIMEOUT;
}

function getBmiStatus(bmi) {
  if (bmi < 18.5) return "Underweight";
  if (bmi < 25) return "Normal weight";
  if (bmi < 30) return "Overweight";
  return "Obesity";
}

// Telegram Bot Handlers
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;

  if (checkSessionTimeout(chatId)) resetSession(chatId);
  else if (!sessions[chatId]) resetSession(chatId);

  sessions[chatId].lastActive = Date.now();

  try {
    const existingUser = await User.findOne({ telegramId: chatId });

    if (existingUser) {
      const plan = {
        bmi: existingUser.bmi,
        calories: existingUser.calories,
        meals: existingUser.meals,
        status: getBmiStatus(existingUser.bmi),
      };
      const mealPlan = plan.meals.join("\n");
      bot.sendMessage(
        chatId,
        `👋 Welcome back, ${existingUser.name}!\n\n` +
          `📊 Your current BMI: ${plan.bmi} (${plan.status})\n` +
          `🔥 Daily Calories: ${plan.calories} kcal\n\n` +
          `🍽️ Your saved meal plan:\n${mealPlan}\n\n` +
          `If you want to update your info and get a new diet plan, type /reset.\n` +
          `Otherwise, enjoy your plan.\n\n` +
          `❤️ Thanks for connecting with us.\n👨‍💻 Developed by Munish Kumar ❤`
      );
    } else {
      bot.sendMessage(
        chatId,
        "🌱 Welcome! Let's start your personalized diet plan.\n👋 What’s your name?"
      );
    }
  } catch (err) {
    console.error(err);
    bot.sendMessage(
      chatId,
      "⚠️ Sorry, something went wrong. Please try again later."
    );
  }
});

bot.onText(/\/reset/, async (msg) => {
  const chatId = msg.chat.id;
  try {
    await User.deleteOne({ telegramId: chatId });
    resetSession(chatId);
    bot.sendMessage(chatId, "🗑️ Your data has been reset. What’s your name?");
  } catch (err) {
    console.error(err);
    bot.sendMessage(chatId, "⚠️ Unable to reset your data. Please try again.");
  }
});

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!text || text.startsWith("/")) return;

  if (!sessions[chatId] || checkSessionTimeout(chatId)) {
    resetSession(chatId);
  }

  sessions[chatId].lastActive = Date.now();

  const session = sessions[chatId];

  if (!session.name) {
    session.name = text.trim();
    return bot.sendMessage(chatId, "📏 What is your height in cm?");
  }

  if (!session.height) {
    const height = parseInt(text);
    if (isNaN(height))
      return bot.sendMessage(chatId, "❌ Please enter a valid number for height in cm.");
    session.height = height;
    return bot.sendMessage(chatId, "⚖️ What is your weight in kg?");
  }

  if (!session.weight) {
    const weight = parseInt(text);
    if (isNaN(weight))
      return bot.sendMessage(chatId, "❌ Please enter a valid number for weight in kg.");
    session.weight = weight;
    return bot.sendMessage(chatId, "🎂 What is your age?");
  }

  if (!session.age) {
    const age = parseInt(text);
    if (isNaN(age))
      return bot.sendMessage(chatId, "❌ Please enter a valid number for age.");
    session.age = age;
    return bot.sendMessage(chatId, "🚻 What’s your gender?", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "Male", callback_data: "gender_male" }],
          [{ text: "Female", callback_data: "gender_female" }],
        ],
      },
    });
  }
});

bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const session = sessions[chatId];
  const data = query.data;

  if (!session) return;

  session.lastActive = Date.now();

  if (data.startsWith("gender_")) {
    session.gender = data.split("_")[1];
    return bot.sendMessage(chatId, "🍽️ What’s your diet preference?", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "Vegetarian", callback_data: "diet_veg" }],
          [{ text: "Non-Vegetarian", callback_data: "diet_nonveg" }],
          [{ text: "Vegan", callback_data: "diet_vegan" }],
        ],
      },
    });
  }

  if (data.startsWith("diet_")) {
    session.diet = data.split("_")[1];
    return bot.sendMessage(chatId, "💪 What’s your activity level?", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "Sedentary", callback_data: "activity_sedentary" }],
          [{ text: "Light", callback_data: "activity_light" }],
          [{ text: "Moderate", callback_data: "activity_moderate" }],
          [{ text: "Heavy", callback_data: "activity_heavy" }],
        ],
      },
    });
  }

  if (data.startsWith("activity_")) {
    session.activity = data.split("_")[1];
    return bot.sendMessage(chatId, "🎯 What’s your goal?", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "Lose Weight", callback_data: "goal_lose" }],
          [{ text: "Gain Weight", callback_data: "goal_gain" }],
          [{ text: "Maintain Weight", callback_data: "goal_maintain" }],
        ],
      },
    });
  }

  if (data.startsWith("goal_")) {
    session.goal = data.split("_")[1];

    // Generate diet plan from logic
    const plan = generateDietPlan(session);
    const mealPlan = plan.meals.join("\n");

    try {
      await User.findOneAndUpdate(
        { telegramId: chatId },
        {
          telegramId: chatId,
          name: session.name,
          height: session.height,
          weight: session.weight,
          age: session.age,
          gender: session.gender,
          diet: session.diet,
          activity: session.activity,
          goal: session.goal,
          bmi: plan.bmi,
          calories: plan.calories,
          meals: plan.meals,
        },
        { upsert: true, new: true }
      );
    } catch (err) {
      console.error("DB Save error:", err);
      return bot.sendMessage(
        chatId,
        "⚠️ Could not save your data. Please try again later."
      );
    }

    bot.sendMessage(
      chatId,
      `🧑 ${session.name}, here is your personalized diet plan:\n\n` +
        `📊 BMI: ${plan.bmi} (${getBmiStatus(plan.bmi)})\n` +
        `🔥 Daily Calories: ${plan.calories} kcal\n\n` +
        `🍽️ Meal Plan:\n${mealPlan}\n\n` +
        `Type /reset if you want to create a new plan.\n\n` +
        `❤️ Thanks for connecting with us.\n👨‍💻 Developed by Munish Kumar ❤`
    );

    delete sessions[chatId];
  }
});

// Express server for Render or other hosts
const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("🤖 FitPlannerAIBot is running!");
});

app.listen(PORT, () => {
  console.log(`🌐 Server running on port ${PORT}`);
});
