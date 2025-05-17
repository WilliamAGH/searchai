import logging

import requests
import trafilatura  # Added trafilatura
from bs4 import BeautifulSoup
from bs4.element import Tag  # Import Tag
from newspaper import Article

logger = logging.getLogger(__name__)

def scrape_url(url: str) -> str:
    """
    Scrape the main text content from the given URL using trafilatura,
    falling back to newspaper3k, and then BeautifulSoup parsing if needed.
    """
    # Try with Trafilatura first for high-quality extraction
    try:
        logger.debug(f"Attempting to scrape {url} with Trafilatura")
        downloaded = trafilatura.fetch_url(url)
        if downloaded:
            # include_tables=False, include_comments=False are defaults but explicit
            text = trafilatura.extract(downloaded, include_comments=False, include_tables=False, deduplicate=True)
            if text:
                logger.info(f"Successfully scraped {url} with Trafilatura, content length: {len(text)}")
                return text
        logger.debug(f"Trafilatura found no main content for {url}")
    except Exception as e:
        logger.warning(f"Trafilatura failed for {url}: {e}", exc_info=True)
        pass # Fall through to next method

    # Try with newspaper3k as a fallback
    try:
        logger.debug(f"Attempting to scrape {url} with newspaper3k")
        article = Article(url)
        article.download()
        article.parse()
        text = article.text
        if text:
            logger.info(f"Successfully scraped {url} with newspaper3k, content length: {len(text)}")
            return text
        logger.debug(f"newspaper3k found no main content for {url}")
    except Exception as e:
        logger.warning(f"newspaper3k failed for {url}: {e}", exc_info=True)
        pass # Fall through to next method

    # Fallback: fetch page and parse <p> tags with BeautifulSoup
    try:
        logger.debug(f"Attempting to scrape {url} with BeautifulSoup")
        response = requests.get(url, timeout=10)
        response.raise_for_status() # Raise an exception for HTTP errors
        soup = BeautifulSoup(response.text, "html.parser")

        target_element: BeautifulSoup | Tag = soup # Default to the whole soup

        # Attempt to find a main content area if possible
        # Ensure that main_content is a Tag before assigning it to target_element
        potential_main_content = soup.find("main") or soup.find("article") or soup.find(id="content") or soup.find(id="main-content")

        if isinstance(potential_main_content, Tag):
            target_element = potential_main_content
        # If potential_main_content is None or NavigableString, target_element remains 'soup'

        paragraphs = target_element.find_all("p")
        text = " ".join(p.get_text(separator=" ", strip=True) for p in paragraphs)
        if text:
            logger.info(f"Successfully scraped {url} with BeautifulSoup, content length: {len(text)}")
            return text
        logger.debug(f"BeautifulSoup found no paragraph content for {url}")
    except requests.exceptions.RequestException as e:
        logger.error(f"Request failed for {url} during BeautifulSoup fallback: {e}", exc_info=True)
    except Exception as e:
        logger.error(f"BeautifulSoup fallback failed for {url}: {e}", exc_info=True)

    logger.warning(f"All scraping methods failed for {url}. Returning empty string.")
    return ""
