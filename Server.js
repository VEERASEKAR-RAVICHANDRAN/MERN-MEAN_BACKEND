const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const path = require('path');
const bcrypt = require('bcrypt');

const port = 3000; 

const app = express();
app.use(bodyParser.json());


mongoose.connect('mongodb://localhost:27017/your_database', {
//   useNewUrlParser: true,
//   useUnifiedTopology: true,
}).then(() => {
  console.log('MongoDB connected successfully');
}).catch(err => {
  console.error('MongoDB connection error:', err);
});

// Schemas
const UserSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  email: { type: String, unique: true, required: true },
  firstName: String,
  lastName: String,
  phoneNumber: String,
  dateOfBirth: String,
});

const ProductSchema = new mongoose.Schema({
  name: String,
  category: String,
  price: Number,
  description: String,
  stock: Number,
});

const OrderSchema = new mongoose.Schema({
  userId: String,
  products: [
    {
      productId: String,
      quantity: Number,
    },
  ],
  shippingAddress: {
    street: String,
    city: String,
    state: String,
    postalCode: {type:String, required:true},
    country: String,
  },
  paymentMethod: String,
  totalAmount: Number,
  status: { type: String, default: 'pending' },
  paymentStatus: { type: String, default: 'pending' },
  orderDate: { type: Date, default: Date.now },
});

const User = mongoose.model('User', UserSchema);
const Product = mongoose.model('Product', ProductSchema);
const Order = mongoose.model('Order', OrderSchema);


// const upload = multer({ dest: 'uploads/' });
const multerStorage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, 'uploads/'); // Directory for storing uploaded files
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, uniqueSuffix + '-' + file.originalname);
    }
  });
  
  const fileFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
  
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('Invalid file type. Only images are allowed.'));
  };
  
  const upload = multer({
    storage: multerStorage,
    limits: { fileSize: 2 * 1024 * 1024 }, 
    fileFilter: fileFilter
  });
  
  // For Uploading products
  app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
  app.post('/api/products', upload.single('productImage'), async (req, res) => {
    try {
      const { name, category, price, description, stock } = req.body;
  
      if (!name || !category || !price || !stock) {
        return res.status(400).json({ error: 'Invalid input. Please check the provided data.' });
      }
  
      let productImage = null;
      if (req.file) {
        productImage = req.file.path;
      }
  
      const product = new Product({
        name,
        category,
        price,
        description,
        stock,
        productImage
      });
  
      await product.save();
      res.status(201).json({
        productId: product._id,
        message: 'Product added successfully',
        productImage: productImage || 'No image uploaded'
      });
    } catch (error) {
      res.status(500).json({ error: 'An unexpected error occurred. Please try again later.' });
    }
  });

// For Registration-->(working)

function validateRegistrationInput(data) {
    const usernameRegex = /^[a-zA-Z0-9_]{4,20}$/;
    const passwordRegex = /^(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*])[A-Za-z0-9!@#$%^&*]{8,}$/;
    const emailRegex = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
    const phoneRegex = /^\d{3}-\d{3}-\d{4}$/;
    const dateOfBirthRegex = /^\d{4}-\d{2}-\d{2}$/;
  
    const errors = [];
  
    if (!usernameRegex.test(data.username)) {
      errors.push('Username must be alphanumeric and between 4 to 20 characters.');
    }
  
    if (!passwordRegex.test(data.password)) {
      errors.push('Password must have at least 8 characters, including one uppercase letter, one number, and one special character.');
    }
  
    if (!emailRegex.test(data.email)) {
      errors.push('Invalid email address format.');
    }
  
    if (data.phoneNumber && !phoneRegex.test(data.phoneNumber)) {
      errors.push('Phone number must match the format 123-456-7890.');
    }
  
    if (data.dateOfBirth && !dateOfBirthRegex.test(data.dateOfBirth)) {
      errors.push('Date of birth must be in YYYY-MM-DD format.');
    }
  
    if (data.dateOfBirth) {
      const today = new Date();
      const birthDate = new Date(data.dateOfBirth);
      const age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
  
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }
  
      if (age < 13) {
        errors.push('User must be at least 13 years old.');
      }
    }
  
    return errors;
  }
  

  app.post('/api/register', async (req, res) => {
    const { username, password, email, firstName, lastName, phoneNumber, dateOfBirth } = req.body;
  
    if (!username || !password || !email) {
      return res.status(400).json({ error: 'Invalid input. Please check the provided data.' });
    }
  
    const validationErrors = validateRegistrationInput(req.body);
    if (validationErrors.length > 0) {
      return res.status(400).json({ error: validationErrors });
    }
  
    try {
      const hashedPassword = await bcrypt.hash(password, 10);
      const user = new User({ username, password: hashedPassword, email, firstName, lastName, phoneNumber, dateOfBirth });
      await user.save();
      res.status(201).json({ userId: user._id, message: 'Registered successfull.....' });
    } catch (error) {
      if (error.code === 11000) {
        res.status(409).json({ error: 'Username or email already exists.' });
      } else {
        res.status(500).json({ error: 'An unexpected error occurred. Please try again later.' });
      }
    }
  });
  

// For Login-->(working)
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }
  try {
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }
    const token = jwt.sign({ userId: user._id, role: user.role }, 'your_secret_key', { expiresIn: '1h' });
    res.status(200).json({ token, expiresIn: 3600, userId: user._id, role: user.role });
  } catch (error) {
    res.status(500).json({ error: 'An unexpected error occurred. Please try again later.' });
  }
});

// For Getting All Products-->(working)
app.get('/api/products', async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const products = await Product.find()
      .skip((page - 1) * limit)
      .limit(Number(limit));
    const total = await Product.countDocuments();
    res.status(200).json({ products, total, page: Number(page), limit: Number(limit) });
  } catch (error) {
    res.status(500).json({ error: 'An unexpected error occurred. Please try again later.' });
  }
});

// For Placing Order-->(working)
app.post('/api/orders', async (req, res) => {
  const { userId, products, shippingAddress, paymentMethod, totalAmount } = req.body;
  if (!userId || !products || !shippingAddress || !paymentMethod || !totalAmount) {
    return res.status(400).json({ error: 'Invalid input. Please check the provided data.' });
  }
  try {
    const order = new Order({ userId, products, shippingAddress, paymentMethod, totalAmount });
    await order.save();
    res.status(201).json({ orderId: order._id, status: order.status, message: 'Order placed successfully.' });
  } catch (error) {
    res.status(500).json({ error: 'An unexpected error occurred. Please try again later.' });
  }
});

// For Displaying Placed Order-->(working)
app.get('/api/orders', async (req, res) => {
  const { userId, page = 1, limit = 10 } = req.query;
  if (!userId) {
    return res.status(400).json({ error: 'Invalid input. Please check the provided parameters.' });
  }
  try {
    const orders = await Order.find({ userId })
      .skip((page - 1) * limit)
      .limit(Number(limit));
    const total = await Order.countDocuments({ userId });
    res.status(200).json({ orders, total, page: Number(page), limit: Number(limit) });
  } catch (error) {
    res.status(500).json({ error: 'An unexpected error occurred. Please try again later.' });
  }
});


app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
