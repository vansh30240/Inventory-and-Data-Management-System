const Product = require('../models/Product');
const { httpError } = require('../middleware/validate');

// Fields a client is allowed to set/update
const ALLOWED_FIELDS = ['name', 'sku', 'category', 'price', 'quantity', 'reorderLevel', 'supplier'];
const pick = (obj) =>
  ALLOWED_FIELDS.reduce((acc, key) => {
    if (obj[key] !== undefined) acc[key] = obj[key];
    return acc;
  }, {});

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// POST /api/products
exports.createProduct = async (req, res, next) => {
  try {
    const product = await Product.create(pick(req.body));
    res.status(201).json(product);
  } catch (err) {
    next(err);
  }
};

// GET /api/products
// ?category=&supplier=&search=&minPrice=&maxPrice=&inStock=true&sort=-price,name&page=1&limit=10
exports.getProducts = async (req, res, next) => {
  try {
    const { category, supplier, search, minPrice, maxPrice, inStock, sort } = req.query;
    const filter = {};

    if (category) filter.category = new RegExp(`^${escapeRegex(category)}$`, 'i');
    if (supplier) filter.supplier = new RegExp(escapeRegex(supplier), 'i');
    if (search) filter.name = new RegExp(escapeRegex(search), 'i');

    if (minPrice !== undefined || maxPrice !== undefined) {
      filter.price = {};
      if (minPrice !== undefined) {
        if (isNaN(minPrice)) throw httpError(400, 'minPrice must be a number');
        filter.price.$gte = Number(minPrice);
      }
      if (maxPrice !== undefined) {
        if (isNaN(maxPrice)) throw httpError(400, 'maxPrice must be a number');
        filter.price.$lte = Number(maxPrice);
      }
    }

    if (inStock === 'true') filter.quantity = { $gt: 0 };
    if (inStock === 'false') filter.quantity = 0;

    // Sorting: comma separated, "-" prefix = descending. Default newest first.
    const sortBy = sort ? sort.split(',').join(' ') : '-createdAt';

    // Pagination
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
    const skip = (page - 1) * limit;

    const [total, products] = await Promise.all([
      Product.countDocuments(filter),
      Product.find(filter).sort(sortBy).skip(skip).limit(limit),
    ]);

    res.json({
      total,
      page,
      totalPages: Math.ceil(total / limit),
      count: products.length,
      products,
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/products/:id
exports.getProductById = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) throw httpError(404, 'Product not found');
    res.json(product);
  } catch (err) {
    next(err);
  }
};

// PUT /api/products/:id
exports.updateProduct = async (req, res, next) => {
  try {
    const product = await Product.findByIdAndUpdate(req.params.id, pick(req.body), {
      new: true,
      runValidators: true,
    });
    if (!product) throw httpError(404, 'Product not found');
    res.json(product);
  } catch (err) {
    next(err);
  }
};

// PATCH /api/products/:id/stock   body: { "change": 10 } (restock) or { "change": -3 } (sale)
// Uses a single atomic $inc, guarded so quantity can never go below zero.
exports.adjustStock = async (req, res, next) => {
  try {
    const { change } = req.body;
    const filter = { _id: req.params.id };
    if (change < 0) filter.quantity = { $gte: -change };

    const product = await Product.findOneAndUpdate(
      filter,
      { $inc: { quantity: change } },
      { new: true, runValidators: true }
    );

    if (!product) {
      const exists = await Product.exists({ _id: req.params.id });
      if (!exists) throw httpError(404, 'Product not found');
      throw httpError(400, 'Insufficient stock for this sale');
    }

    res.json({ message: 'Stock updated', product });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/products/:id
exports.deleteProduct = async (req, res, next) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) throw httpError(404, 'Product not found');
    res.json({ message: 'Product deleted', id: product.id });
  } catch (err) {
    next(err);
  }
};

// GET /api/products/low-stock  -> items where quantity <= reorderLevel
exports.getLowStock = async (req, res, next) => {
  try {
    const lowStockItems = await Product.find({
      $expr: { $lte: ['$quantity', '$reorderLevel'] },
    }).sort('quantity');

    res.json({ count: lowStockItems.length, lowStockItems });
  } catch (err) {
    next(err);
  }
};

// GET /api/products/summary  -> category-wise aggregation
exports.getSummary = async (req, res, next) => {
  try {
    const summary = await Product.aggregate([
      {
        $group: {
          _id: '$category',
          totalItems: { $sum: 1 },
          totalQuantity: { $sum: '$quantity' },
          totalStockValue: { $sum: { $multiply: ['$price', '$quantity'] } },
          avgPrice: { $avg: '$price' },
        },
      },
      {
        $project: {
          totalItems: 1,
          totalQuantity: 1,
          totalStockValue: 1,
          avgPrice: { $round: ['$avgPrice', 2] },
        },
      },
      { $sort: { totalStockValue: -1 } },
    ]);

    res.json({ categories: summary.length, summary });
  } catch (err) {
    next(err);
  }
};
