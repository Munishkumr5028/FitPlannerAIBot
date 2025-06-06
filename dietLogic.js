function calculateBMR(gender, weight, height, age) {
  if (gender === "male") {
    return 10 * weight + 6.25 * height - 5 * age + 5;
  } else {
    return 10 * weight + 6.25 * height - 5 * age - 161;
  }
}

// Add sedentary key as alias for low
function getActivityMultiplier(level) {
  const map = {
    sedentary: 1.2,
    low: 1.2,
    light: 1.375,
    moderate: 1.55,
    heavy: 1.725,
  };
  return map[level] || 1.2;
}

function getGoalAdjustment(goal) {
  const map = {
    lose: -500,
    gain: 500,
    maintain: 0,
  };
  return map[goal] || 0;
}

function generateDietPlan({
  height,
  weight,
  age,
  gender,
  diet,
  activity,
  goal,
}) {
  const bmi = weight / (height / 100) ** 2;
  const bmr = calculateBMR(gender, weight, height, age);
  const tdee = bmr * getActivityMultiplier(activity);
  const targetCalories = Math.round(tdee + getGoalAdjustment(goal));

  const plan = {
    calories: targetCalories,
    bmi: parseFloat(bmi.toFixed(1)),
    status:
      bmi < 18.5
        ? "Underweight"
        : bmi < 25
        ? "Normal"
        : bmi < 30
        ? "Overweight"
        : "Obese",
    meals: [],
  };

  // Meal distribution
  const meals = {
    breakfast: Math.round(targetCalories * 0.25),
    lunch: Math.round(targetCalories * 0.35),
    dinner: Math.round(targetCalories * 0.25),
    snacks: Math.round(targetCalories * 0.15),
  };

  if (diet === "veg") {
    plan.meals.push(
      `🥣 Breakfast: Oats + milk + banana – ${meals.breakfast} kcal`,
      `🥗 Lunch: Dal, roti, salad, curd – ${meals.lunch} kcal`,
      `🍽 Dinner: Paneer sabzi + roti + veggies – ${meals.dinner} kcal`,
      `🍎 Snacks: Fruits or nuts – ${meals.snacks} kcal`
    );
  } else if (diet === "vegan") {
    plan.meals.push(
      `🥣 Breakfast: Smoothie with plant milk, oats, and fruit – ${meals.breakfast} kcal`,
      `🥗 Lunch: Lentils, quinoa, mixed veggies salad – ${meals.lunch} kcal`,
      `🍽 Dinner: Tofu stir-fry with brown rice – ${meals.dinner} kcal`,
      `🍎 Snacks: Nuts, seeds, or fruit – ${meals.snacks} kcal`
    );
  } else {
    // Non-veg default
    plan.meals.push(
      `🥣 Breakfast: Eggs + toast + fruit – ${meals.breakfast} kcal`,
      `🥗 Lunch: Chicken breast + rice + salad – ${meals.lunch} kcal`,
      `🍽 Dinner: Fish curry + chapati + vegetables – ${meals.dinner} kcal`,
      `🍎 Snacks: Boiled eggs / nuts – ${meals.snacks} kcal`
    );
  }

  return plan;
}

module.exports = { generateDietPlan };
