const pool = require("../config/db");



// router.post('/add',addTransaction);
// router.get('/getAll',getTransaction);
// router.patch('/update/:id',updateTransaction);
// router.delete('/delete/:id',deleteTransaction);


async function addTransaction(req, res) {
  try {
    const { payload } = req.body;

    if (!payload) {
      return res.status(400).json({ error: 'Payload is required' });
    }

    const user = req.user;

    const result =await pool.query(
      'INSERT INTO transactions (broker_id, payload) VALUES ($1, $2) RETURNING *',
      [user.id, payload]
    );
    console.log(result.rows[0])

    res.status(201).json({ message: 'Transaction added successfully'  , data : result.rows[0]});

  } catch (err) {
        console.error('Add transaction error:', err.message);
        res.status(500).json({ error: 'Internal server error' });
  }
}


async function getTransaction(req,res){

    try {
        const user = req.user;
        const result = await pool.query(
          'SELECT id, payload, created_at FROM transactions WHERE broker_id = $1 ORDER BY created_at DESC',
          [user.id]
        );
        res.status(200).json({ transactions: result.rows });    
    } catch (error) {
         console.error('Get transaction error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
        
    }
}


async function updateTransaction(req,res){


    try {

        const {id} = req.params;


        if (!id) {
  return res.status(400).json({ error: 'Invalid transaction id' });
}
        const { payload } = req.body;
        if (!payload) {
            return res.status(400).json({ error: 'Payload is required' });
          }
        const user = req.user;
        
        const result = await pool.query(
            'UPDATE transactions SET payload = $1 WHERE id = $2 AND broker_id = $3 RETURNING id',
            [payload, id, user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Transaction not found' });
        }

        res.status(200).json({ message: 'Transaction updated successfully' });

    } catch (error) {
         console.error('Update transaction error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
        
    }
}


async function deleteTransaction(req,res){
   try {
    
    const {id} = req.params;


    if (!id) {
  return res.status(400).json({ error: 'Invalid transaction id' });
}
    const user = req.user;
    const result = await pool.query(
        'DELETE FROM transactions WHERE id = $1 AND broker_id = $2 RETURNING id',
        [id, user.id]
    );

    if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Transaction not found' });
    }

    res.status(200).json({ message: 'Transaction deleted successfully' });



   } catch (error) {
         console.error('Delete transaction error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
   }
}



async function updateTransactionDate(req, res) {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: 'Invalid transaction id' });
    }

    const user = req.user;

    const { updatedDate } = req.body;
    if (!updatedDate) {
      return res.status(400).json({ error: 'Updated date is required' });
    }

    // Convert "DD/MM/YYYY" → ISO format
    const [day, month, year] = updatedDate.split('/');

    const formattedDate = new Date(`${year}-${month}-${day}T00:00:00Z`);

    const result = await pool.query(
      `UPDATE transactions 
       SET created_at = $1 
       WHERE id = $2 AND broker_id = $3 
       RETURNING id`,
      [formattedDate, id, user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    res.status(200).json({ message: 'Transaction date updated successfully' });

  } catch (error) {
    console.log('Update transaction date error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}
module.exports = { addTransaction, getTransaction,updateTransaction,deleteTransaction,updateTransactionDate };
