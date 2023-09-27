// Import necessary libraries/modules
const express = require('express');
const bodyParser = require('body-parser');
const puppeteer = require('puppeteer'); // For web scraping
const axios = require('axios'); // HTTP Client
const cheerio = require('cheerio'); // For parsing markup
const Sentiment = require('sentiment'); // For performing sentiment analysis
const cors = require('cors'); // For enabling Cross-Origin 
const corsOptions = require('./config/corsOptions'); // Importing CORS configuration
const { en: stopWords } = require('stopword'); // Importing English stop words

// Initialize the Express application
const app = express();

// Apply middleware
app.use(cors(corsOptions)); // Configuring Cross-Origin
app.use(bodyParser.json()); // Parse incoming request bodies in a middleware before handlers

// Define route to perform web scraping
app.post('/api/scrape', async (req, res) => {
    try {
        // Log for debugging
        console.log('URL:', req.body.url);
        console.log('Elements:', req.body.elements);

        // Extract URL and elements from the request body
        const url = req.body.url;
        const elements = req.body.elements || ['h3', 'p'];

        // Launch Puppeteer browser to get content from the specified URL
        const browser = await puppeteer.launch();
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'networkidle2' });
        const content = await page.content(); // Getting HTML content of the page
        await browser.close(); // Closing the Puppeteer browser

        // Load content into Cheerio for parsing
        const $ = cheerio.load(content);

        // Initializing result object
        const result = {};
        elements.forEach(element => {
            result[element] = [];
            $(element).each((index, el) => {
                let text;
                if (element === 'img') { // Handling image elements differently to get src attribute
                    text = $(el).attr('src') || $(el).attr('data-src');
                } else {
                    text = $(el).text().trim(); // Trimming unnecessary whitespace
                }

                if (text) result[element].push(text);
            });
        });

        // Perform sentiment analysis
        const sentiment = new Sentiment();
        const textContent = Object.values(result).flat().filter(Boolean).join(' ');
        const { score } = sentiment.analyze(textContent);
        const sentimentResult = score === 0 ? 'neutral' : score > 0 ? 'positive' : 'negative';

        // Count words and filter out stop words and words with less than 3 characters
        const wordCount = textContent.split(' ').length;
        const words = textContent.split(' ')
            .map(word => word.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "").toLowerCase())
            .filter(Boolean)
            .filter(word => word.length > 3);
        const keywords = words.filter(word => !stopWords?.includes(word));
        
        // Counting keyword frequency and returning top 3
        const keywordCounts = {};
        keywords.forEach(word => keywordCounts[word] = (keywordCounts[word] || 0) + 1);
        const sortedKeywords = Object.entries(keywordCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(entry => entry[0]);
        
        // Check if there are any empty elements and return an error if found
        const emptyElements = elements.filter(element => result[element].length === 0);
        if (emptyElements.length > 0) {
            return res.status(400).json({ error: `No content found for elements: ${emptyElements.join(', ')}` });
        }
        
        // Sending the response
        res.json({ ...result, sentiment: sentimentResult, wordCount, keywords: sortedKeywords });

    } catch (error) {
        console.error(error); // Log any error that occurs during the execution
        res.status(400).json({ error: error.message }); // Send an error response
    }
});

// Starting the server on port 3001
const PORT = 3001;
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
