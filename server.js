const express = require('express');
const bodyParser = require('body-parser');
const puppeteer = require('puppeteer');
const axios = require('axios');
const cheerio = require('cheerio');
const Sentiment = require('sentiment');
const cors = require('cors');
const corsOptions = require('./config/corsOptions')
const { en: stopWords } = require('stopword'); // Correct way to import English stop words

const app = express();

app.use(cors(corsOptions)); // You might want to configure cors according to your needs
app.use(bodyParser.json());


app.post('/api/scrape', async (req, res) => {
    try {
        console.log('URL:', req.body.url);
        console.log('Elements:', req.body.elements);

        const url = req.body.url;
        const elements = req.body.elements || ['h3'];
        // ['div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'a', 'img'];

        // Launching Puppeteer browser to get the content
        const browser = await puppeteer.launch();
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'networkidle2' });
        const content = await page.content();
        await browser.close();

        // Load content to Cheerio
        const $ = cheerio.load(content);

        const result = {};
        elements.forEach(element => {
            result[element] = [];
            $(element).each((index, el) => {
                let text;
                if (element === 'img') {
                    text = $(el).attr('src') || $(el).attr('data-src');
                } else {
                    text = $(el).text().trim(); // Trim to remove leading and trailing whitespace
                }

                if (text) result[element].push(text); // If text is not empty, then push it to result
            });
        });

        const sentiment = new Sentiment();
        const textContent = Object.values(result).flat().filter(Boolean).join(' '); // filter(Boolean) to remove any empty strings
        const { score } = sentiment.analyze(textContent);
        const sentimentResult = score === 0 ? 'neutral' : score > 0 ? 'positive' : 'negative';

        const wordCount = textContent.split(' ').length;
        const words = textContent.split(' ')
            .map(word => word.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "").toLowerCase()) // Remove punctuations and convert to lower case
            .filter(Boolean) // Remove empty strings
            .filter(word => word.length > 3); // Filter words with more than 3 letters
        const keywords = words.filter(word => !stopWords?.includes(word));

        const emptyElements = elements.filter(element => result[element].length === 0);
        if (emptyElements.length > 0) {
            return res.status(400).json({ error: `No content found for elements: ${emptyElements.join(', ')}` });
        }

        // Counting the frequency of each keyword
        const keywordCounts = {};
        keywords.forEach(word => keywordCounts[word] = (keywordCounts[word] || 0) + 1);

        // Sorting the keywords by frequency and selecting top 5
        const sortedKeywords = Object.entries(keywordCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(entry => entry[0]);

        res.json({ ...result, sentiment: sentimentResult, wordCount, keywords: sortedKeywords });

    } catch (error) {
        console.error(error);
        res.status(400).json({ error: error.message });
    }
});

const PORT = 3001;
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));