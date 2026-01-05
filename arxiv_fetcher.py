"""
arXiv Paper Fetcher
Fetches the latest papers from arXiv based on search queries.
"""

import arxiv
from typing import List, Dict
from datetime import datetime


class ArxivFetcher:
    """Fetches papers from arXiv API"""

    def __init__(self):
        self.client = arxiv.Client()

    def search_papers(self, query: str = "generative AI", max_results: int = 10) -> List[Dict]:
        """
        Search for papers on arXiv

        Args:
            query: Search query string
            max_results: Maximum number of results to return

        Returns:
            List of paper dictionaries with metadata
        """
        search = arxiv.Search(
            query=query,
            max_results=max_results,
            sort_by=arxiv.SortCriterion.SubmittedDate,
            sort_order=arxiv.SortOrder.Descending
        )

        papers = []
        for result in self.client.results(search):
            paper_data = {
                'title': result.title,
                'authors': [author.name for author in result.authors],
                'summary': result.summary,
                'published': result.published.strftime('%Y-%m-%d'),
                'pdf_url': result.pdf_url,
                'entry_id': result.entry_id,
                'categories': result.categories,
                'primary_category': result.primary_category
            }
            papers.append(paper_data)

        return papers

    def get_latest_ai_papers(self, max_results: int = 10) -> List[Dict]:
        """Get latest generative AI papers"""
        queries = [
            "generative AI OR diffusion model OR large language model",
            "GPT OR transformer OR attention mechanism",
            "image generation OR text generation OR multimodal"
        ]

        # Use the most comprehensive query
        return self.search_papers(queries[0], max_results)

    def search_by_category(self, category: str = "cs.AI", max_results: int = 10) -> List[Dict]:
        """
        Search papers by arXiv category

        Common AI categories:
        - cs.AI: Artificial Intelligence
        - cs.LG: Machine Learning
        - cs.CV: Computer Vision
        - cs.CL: Computation and Language
        """
        search = arxiv.Search(
            query=f"cat:{category}",
            max_results=max_results,
            sort_by=arxiv.SortCriterion.SubmittedDate,
            sort_order=arxiv.SortOrder.Descending
        )

        papers = []
        for result in self.client.results(search):
            paper_data = {
                'title': result.title,
                'authors': [author.name for author in result.authors],
                'summary': result.summary,
                'published': result.published.strftime('%Y-%m-%d'),
                'pdf_url': result.pdf_url,
                'entry_id': result.entry_id,
                'categories': result.categories,
                'primary_category': result.primary_category
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
