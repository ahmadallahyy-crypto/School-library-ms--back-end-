// Picks only allowed fields from an object or array of objects
// Prevents client from injecting unwanted fields e.g. role, __v, createdAt

const pick = (obj, allowedKeys) => {

  // Return empty object if input is null, undefined or not an object
  if (!obj || typeof obj !== "object") return {};

  // If array — run pick on each item individually e.g. bulk create
  if (Array.isArray(obj)) {
    return obj.map(item => pick(item, allowedKeys));
  }

  // Loop through allowedKeys — only copy keys that exist on the object
  // hasOwnProperty check prevents picking inherited prototype keys
  const result = {};
  for (const key of allowedKeys) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      result[key] = obj[key];
    }
  }
  return result;
};

// Example:
// pick({ name: "Alice", role: "admin" }, ["name"]) → { name: "Alice" }
// role is dropped — not in allowedKeys

module.exports = pick;