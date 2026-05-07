const express = require('express');
const router = express.Router();
const { addTransaction ,getTransaction,updateTransaction,deleteTransaction, updateTransactionDate} = require('../controllers/transactionController');



router.post('/add',addTransaction);
router.get('/getAll',getTransaction);
router.patch('/update/:id',updateTransaction);
router.delete('/delete/:id',deleteTransaction);
router.post('/updateDate/:id',updateTransactionDate);


module.exports = router;