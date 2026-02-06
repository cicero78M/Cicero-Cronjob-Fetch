import axios from 'axios';

const QUOTES_URL = 'https://type.fit/api/quotes';
const TRANSLATE_URL = 'https://api.azharimm.com/translate';

async function fetchRandomQuote() {
  const { data } = await axios.get(QUOTES_URL);
  const quotes = Array.isArray(data) ? data : [];
  const index = Math.floor(Math.random() * quotes.length);
  return quotes[index] || { text: '', author: '' };
}

async function translateText(text, to = 'id') {
  const { data } = await axios.get(TRANSLATE_URL, { params: { text, to } });
  return data?.data?.translation || data?.translation || data;
}

export async function fetchTranslatedRandomQuote() {
  const quote = await fetchRandomQuote();
  const translation = await translateText(quote.text, 'id');
  return { ...quote, translation };
}
