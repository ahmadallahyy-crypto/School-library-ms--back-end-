// Reusable pagination utility for any Mongoose model
// Returns { data, meta } — meta contains page info for frontend pagination UI

const paginate = async (Model, filter = {}, options = {}) => {

  // Parse page and limit — fallback to defaults if missing or invalid
  let page  = parseInt(options.page,  10);
  let limit = parseInt(options.limit, 10);

  if (isNaN(page)  || page  < 1) page  = 1;
  if (isNaN(limit) || limit < 1) limit = 10;
  limit = Math.min(limit, 100); // hard cap — prevents client requesting 10000 items at once

  const skip     = (page - 1) * limit; // how many documents to skip e.g. page 3 = skip 20
  const sort     = options.sort     !== undefined ? options.sort     : { createdAt: -1 }; // newest first by default
  const lean     = options.lean     !== undefined ? options.lean     : true;  // plain JSON is faster than Mongoose docs
  const select   = options.select   || null;   // fields to include/exclude
  const populate = options.populate || null;   // replace ObjectIds with actual documents

  // Build query step by step
  let query = Model.find(filter);

  if (sort)     query = query.sort(sort);
  if (select)   query = query.select(select);
  if (skip)     query = query.skip(skip);
  if (limit)    query = query.limit(limit);
  if (populate) query = query.populate(populate);
  if (lean)     query = query.lean();

  // Run data query and count in parallel — faster than running one after the other
  const [data, total] = await Promise.all([
    query.exec(),
    Model.countDocuments(filter)
  ]);

  const totalPages = Math.ceil(total / limit);

  return {
    data,
    meta: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages, // true if more pages exist after this one
      hasPrevPage: page > 1,          // true if not on the first page
    },
  };
};

module.exports = paginate;