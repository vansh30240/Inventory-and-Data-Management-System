const express = require('express');
const ctrl = require('../controllers/productController');
const { validateObjectId, validateStockChange, requireBody } = require('../middleware/validate');

const router = express.Router();

// Static report routes MUST come before "/:id" or they would be treated as ids
router.get('/low-stock', ctrl.getLowStock);
router.get('/summary', ctrl.getSummary);

router.route('/')
  .get(ctrl.getProducts)
  .post(requireBody, ctrl.createProduct);

router.patch('/:id/stock', validateObjectId, validateStockChange, ctrl.adjustStock);

router.route('/:id')
  .get(validateObjectId, ctrl.getProductById)
  .put(validateObjectId, requireBody, ctrl.updateProduct)
  .delete(validateObjectId, ctrl.deleteProduct);

module.exports = router;
