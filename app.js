const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const Datastore = require('nedb');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
const db = new Datastore({ filename: 'urls.db', autoload: true });

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: false }));

app.get('/', (req, res) => {
  res.render('index');
});

app.post('/add-url', (req, res) => {
  const { url } = req.body;
  if (url) {
    db.insert({ url }, (err, newDoc) => {
      if (err) {
        console.error(err);
      }
      res.redirect('/urls');
    });
  } else {
    res.redirect('/');
  }
});

app.get('/urls', (req, res) => {
  db.find({}, (err, docs) => {
    if (err) {
      console.error(err);
      res.sendStatus(500);
    } else {
      res.render('urls', { urls: docs });
    }
  });
});

app.post('/delete-url', (req, res) => {
  const { id } = req.body;
  db.remove({ _id: id }, {}, (err, numRemoved) => {
    if (err) {
      console.error(err);
    }
    res.redirect('/urls');
  });
});

app.post('/check-status', async (req, res) => {
    const { id } = req.body;
    db.findOne({ _id: id }, async (err, doc) => {
      if (err) {
        console.error(err);
        return res.sendStatus(500);
      }
      if (!doc) {
        return res.sendStatus(404);
      }
  
      try {
        const response = await axios.get(doc.url);
        const $ = cheerio.load(response.data);
        const content = $('body').html();
  
        const status = (content.includes('apiframe.pro') || content.includes('midjourney.co.in')) ? 'active' : 'dead';
        const lastChecked = new Date().toISOString();
  
        db.update({ _id: id }, { $set: { status, lastChecked } }, {}, (err) => {
          if (err) {
            console.error(err);
            return res.sendStatus(500);
          }
          res.redirect('/urls');
        });
      } catch (error) {
        console.error(error);
        res.sendStatus(500);
      }
    });
});

app.post('/check-status-all', async (req, res) => {
    db.find({}, async (err, docs) => {
      if (err) {
        console.error(err);
        return res.sendStatus(500);
      }
  
      const updatePromises = docs.map(async (doc) => {
        try {
          const response = await axios.get(doc.url);
          const $ = cheerio.load(response.data);
          const content = $('body').html();
  
          const status = (content.includes('apiframe.pro') || content.includes('midjourney.co.in')) ? 'active' : 'dead';
          const lastChecked = new Date().toISOString();
  
          return new Promise((resolve, reject) => {
            db.update({ _id: doc._id }, { $set: { status, lastChecked } }, {}, (err) => {
              if (err) {
                console.error(err);
                return reject(err);
              }
              resolve();
            });
          });
        } catch (error) {
          console.error(`Error checking status for URL: ${doc.url}`, error);
          return new Promise((resolve, reject) => {
            const lastChecked = new Date().toISOString();
            db.update({ _id: doc._id }, { $set: { status: 'error', lastChecked } }, {}, (err) => {
              if (err) {
                console.error(err);
                return reject(err);
              }
              resolve();
            });
          });
        }
      });
  
      await Promise.all(updatePromises);
      res.redirect('/urls');
    });
  });
  

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
