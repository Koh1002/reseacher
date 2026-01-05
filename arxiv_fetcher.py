"""
arXiv Paper Fetcher
Fetches the latest papers from arXiv based on search queries.
"""

import requests
import xml.etree.ElementTree as ET
from typing import List, Dict
from datetime import datetime
from urllib.parse import urlencode


class ArxivFetcher:
    """Fetches papers from arXiv API"""

    def __init__(self):
        self.base_url = "https://export.arxiv.org/api/query"
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }

    def search_papers(self, query: str = "generative AI", max_results: int = 10) -> List[Dict]:
        """
        Search for papers on arXiv

        Args:
            query: Search query string
            max_results: Maximum number of results to return

        Returns:
            List of paper dictionaries with metadata
        """
        params = {
            'search_query': query,
            'start': 0,
            'max_results': max_results,
            'sortBy': 'submittedDate',
            'sortOrder': 'descending'
        }

        response = requests.get(self.base_url, params=params, headers=self.headers)
        response.raise_for_status()

        return self._parse_response(response.text)

    def get_latest_ai_papers(self, max_results: int = 10) -> List[Dict]:
        """Get latest generative AI papers"""
        # Search for AI papers in relevant categories
        query = "cat:cs.AI OR cat:cs.LG OR cat:cs.CL OR cat:cs.CV"
        return self.search_papers(query, max_results)

    def search_by_category(self, category: str = "cs.AI", max_results: int = 10) -> List[Dict]:
        """
        Search papers by arXiv category

        Common AI categories:
        - cs.AI: Artificial Intelligence
        - cs.LG: Machine Learning
        - cs.CV: Computer Vision
        - cs.CL: Computation and Language
        """
        params = {
            'search_query': f'cat:{category}',
            'start': 0,
            'max_results': max_results,
            'sortBy': 'submittedDate',
            'sortOrder': 'descending'
        }

        response = requests.get(self.base_url, params=params, headers=self.headers)
        response.raise_for_status()

        return self._parse_response(response.text)

    def _parse_response(self, xml_text: str) -> List[Dict]:
        """Parse arXiv API XML response"""
        namespace = {'atom': 'http://www.w3.org/2005/Atom',
                     'arxiv': 'http://arxiv.org/schemas/atom'}

        root = ET.fromstring(xml_text)
        papers = []

        for entry in root.findall('atom:entry', namespace):
            # Extract title
            title_elem = entry.find('atom:title', namespace)
            title = title_elem.text.strip().replace('\n', ' ') if title_elem is not None else 'No title'

            # Extract authors
            authors = []
            for author in entry.findall('atom:author', namespace):
                name_elem = author.find('atom:name', namespace)
                if name_elem is not None:
                    authors.append(name_elem.text)

            # Extract summary
            summary_elem = entry.find('atom:summary', namespace)
            summary = summary_elem.text.strip().replace('\n', ' ') if summary_elem is not None else ''

            # Extract published date
            published_elem = entry.find('atom:published', namespace)
            published = ''
            if published_elem is not None:
                try:
                    dt = datetime.fromisoformat(published_elem.text.replace('Z', '+00:00'))
                    published = dt.strftime('%Y-%m-%d')
                except:
                    published = published_elem.text[:10]

            # Extract PDF URL
            pdf_url = ''
            for link in entry.findall('atom:link', namespace):
                if link.get('title') == 'pdf':
                    pdf_url = link.get('href', '')
                    break

            # Extract entry ID
            id_elem = entry.find('atom:id', namespace)
            entry_id = id_elem.text if id_elem is not None else ''

            # Extract categories
            categories = []
            primary_category = ''
            primary_cat_elem = entry.find('arxiv:primary_category', namespace)
            if primary_cat_elem is not None:
                primary_category = primary_cat_elem.get('term', '')
                categories.append(primary_category)

            for cat in entry.findall('atom:category', namespace):
                term = cat.get('term', '')
                if term and term != primary_category:
                    categories.append(term)

            paper_data = {
                'title': title,
                'authors': authors,
                'summary': summary,
                'published': published,
                'pdf_url': pdf_url,
                'entry_id': entry_id,
                'categories': categories,
                'primary_category': primary_category
            }
            papers.append(paper_data)

        return papers


if __name__ == "__main__":
    # Test the fetcher
    fetcher = ArxivFetcher()
    papers = fetcher.get_latest_ai_papers(max_results=5)

    print(f"Found {len(papers)} papers:")
    for i, paper in enumerate(papers, 1):
        print(f"\n{i}. {paper['title']}")
        print(f"   Authors: {', '.join(paper['authors'][:3])}")
        print(f"   Published: {paper['published']}")
        print(f"   URL: {paper['pdf_url']}")
