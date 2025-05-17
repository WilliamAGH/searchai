"""
Web content scraping utilities
:author: William Callahan
"""
import logging

import requests
import trafilatura
from bs4 import BeautifulSoup
from bs4.element import Tag
from django.conf import settings
from newspaper import Article

from ..services.search import get_requests_session

logger = logging.getLogger(__name__)

def scrape_url(url: str) -> str:
    """
    Extracts the main textual content from a web page URL using multiple fallback scraping methods.
    
    Attempts extraction in the following order: Trafilatura for high-quality content, newspaper3k for article parsing, and BeautifulSoup for basic HTML parsing. Returns the extracted text, or an empty string if all methods fail.
    
    Args:
        url: The URL of the web page to scrape.
    
    Returns:
        The main text content as a string, or an empty string if extraction is unsuccessful.
    """
    # Try with Trafilatura first for high-quality extraction
    try:
        logger.debug(f"Attempting to scrape {url} with Trafilatura")
        # Configure trafilatura with our timeout settings
        timeout = getattr(settings, "REQUESTS_TIMEOUT", 10)
        downloaded = trafilatura.fetch_url(url, timeout=timeout)
        if downloaded:
            text = trafilatura.extract(downloaded, include_comments=False, include_tables=False, deduplicate=True)
            if text:
                logger.info(f"Successfully scraped {url} with Trafilatura, content length: {len(text)}")
                return text
        logger.debug(f"Trafilatura found no main content for {url}")
    except Exception as e:
        logger.warning(f"Trafilatura failed for {url}: {e}", exc_info=True)

    # Try with newspaper3k as a fallback
    try:
        logger.debug(f"Attempting to scrape {url} with newspaper3k")
        timeout = getattr(settings, "REQUESTS_TIMEOUT", 10)
        article = Article(url)
        # Set config for newspaper3k
        article.config.fetch_timeout = timeout
        article.download()
        article.parse()
        text = article.text
        if text:
            logger.info(f"Successfully scraped {url} with newspaper3k, content length: {len(text)}")
            return text
        logger.debug(f"newspaper3k found no main content for {url}")
    except Exception as e:
        logger.warning(f"newspaper3k failed for {url}: {e}", exc_info=True)

    # Fallback: fetch page and parse <p> tags with BeautifulSoup
    try:
        logger.debug(f"Attempting to scrape {url} with BeautifulSoup")
        # Use connection pooling session
        session = get_requests_session()
        if session is None:
            # Graceful degradation: fall back to module-level requests object
            session = requests
        timeout = getattr(settings, "REQUESTS_TIMEOUT", 10)
        response = session.get(url, timeout=timeout)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")

        target_element: BeautifulSoup | Tag = soup

        # Attempt to find a main content area if possible
        potential_main_content = soup.find("main") or soup.find("article") or soup.find(id="content") or soup.find(id="main-content")

        if isinstance(potential_main_content, Tag):
            target_element = potential_main_content

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
