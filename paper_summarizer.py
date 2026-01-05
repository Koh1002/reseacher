"""
AI Paper Summarizer Agent
Uses Claude API to summarize papers and generate diagrams.
"""

import os
from typing import Dict, Optional
import anthropic
from dotenv import load_dotenv

load_dotenv()


class PaperSummarizer:
    """AI agent for summarizing research papers and generating diagrams"""

    def __init__(self, api_key: Optional[str] = None):
        """
        Initialize the summarizer

        Args:
            api_key: Anthropic API key (defaults to env variable)
        """
        self.api_key = api_key or os.getenv('ANTHROPIC_API_KEY')
        if not self.api_key:
            raise ValueError("ANTHROPIC_API_KEY not found in environment variables")

        self.client = anthropic.Anthropic(api_key=self.api_key)

    def summarize_paper(self, paper: Dict) -> Dict:
        """
        Summarize a research paper with clear explanations and diagrams

        Args:
            paper: Dictionary containing paper metadata and abstract

        Returns:
            Dictionary with summary, key points, and mermaid diagram
        """
        title = paper.get('title', '')
        authors = paper.get('authors', [])
        abstract = paper.get('summary', '')
        published = paper.get('published', '')

        prompt = f"""あなたは研究論文を分かりやすく解説する専門家です。以下の論文を分析して、簡潔でわかりやすい要約を作成してください。

論文タイトル: {title}
著者: {', '.join(authors[:5])}
公開日: {published}
アブストラクト:
{abstract}

以下の形式で回答してください:

1. **概要** (2-3文で論文の核心を説明)

2. **主な貢献・成果** (3-5個の箇条書き)

3. **技術的アプローチ** (手法や技術の説明)

4. **重要性・インパクト** (なぜこの研究が重要か)

5. **Mermaidダイアグラム** (論文のアーキテクチャや手法を視覚化)
   - flowchartまたはgraphを使用
   - 日本語ラベルを使用
   - システムの全体像や処理フローを図解

Mermaidダイアグラムは以下のような形式で記述してください:
```mermaid
graph TD
    A[入力] --> B[処理]
    B --> C[出力]
```

できるだけ専門用語を使いつつも、分かりやすく説明してください。"""

        try:
            message = self.client.messages.create(
                model="claude-sonnet-4-5-20250929",
                max_tokens=2000,
                temperature=0.7,
                messages=[
                    {
                        "role": "user",
                        "content": prompt
                    }
                ]
            )

            response_text = message.content[0].text

            # Extract mermaid diagram if present
            mermaid_diagram = self._extract_mermaid(response_text)

            return {
                'title': title,
                'authors': authors,
                'published': published,
                'pdf_url': paper.get('pdf_url', ''),
                'summary': response_text,
                'mermaid_diagram': mermaid_diagram,
                'original_abstract': abstract
            }

        except Exception as e:
            return {
                'title': title,
                'authors': authors,
                'published': published,
                'pdf_url': paper.get('pdf_url', ''),
                'summary': f"要約の生成中にエラーが発生しました: {str(e)}",
                'mermaid_diagram': None,
                'original_abstract': abstract
            }

    def _extract_mermaid(self, text: str) -> Optional[str]:
        """Extract mermaid diagram code from text"""
        if '```mermaid' in text:
            start = text.find('```mermaid') + len('```mermaid')
            end = text.find('```', start)
            if end != -1:
                return text[start:end].strip()
        return None

    def summarize_multiple_papers(self, papers: list) -> list:
        """
        Summarize multiple papers

        Args:
            papers: List of paper dictionaries

        Returns:
            List of summarized papers
        """
        summaries = []
        for paper in papers:
            summary = self.summarize_paper(paper)
            summaries.append(summary)

        return summaries

    def compare_papers(self, papers: list) -> Dict:
        """
        Compare multiple papers and identify common themes

        Args:
            papers: List of paper dictionaries

        Returns:
            Dictionary with comparison analysis
        """
        if len(papers) < 2:
            return {"error": "Need at least 2 papers to compare"}

        papers_text = "\n\n".join([
            f"論文 {i+1}: {p['title']}\n要約: {p.get('summary', '')[:500]}"
            for i, p in enumerate(papers[:5])
        ])

        prompt = f"""以下の研究論文を比較分析してください:

{papers_text}

以下の観点で分析してください:
1. 共通するテーマやトレンド
2. 異なるアプローチの比較
3. 研究分野の最新動向
4. 今後の展望

簡潔に、かつ洞察力のある分析を提供してください。"""

        try:
            message = self.client.messages.create(
                model="claude-sonnet-4-5-20250929",
                max_tokens=1500,
                temperature=0.7,
                messages=[{"role": "user", "content": prompt}]
            )

            return {
                'comparison': message.content[0].text,
                'num_papers': len(papers)
            }

        except Exception as e:
            return {
                'comparison': f"比較分析中にエラーが発生しました: {str(e)}",
                'num_papers': len(papers)
            }


if __name__ == "__main__":
    # Test the summarizer
    summarizer = PaperSummarizer()

    test_paper = {
        'title': 'Attention Is All You Need',
        'authors': ['Vaswani et al.'],
        'summary': 'We propose a new simple network architecture, the Transformer, based solely on attention mechanisms...',
        'published': '2017-06-12',
        'pdf_url': 'https://arxiv.org/pdf/1706.03762'
    }

    print("Testing paper summarizer...")
    result = summarizer.summarize_paper(test_paper)
    print(f"Summary generated for: {result['title']}")
