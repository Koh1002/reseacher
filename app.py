"""
AI Paper Summarizer Web Application
Flask backend API for the paper summarizer agent
"""

from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
from arxiv_fetcher import ArxivFetcher
from paper_summarizer import PaperSummarizer
import os
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
CORS(app)

# Initialize components
fetcher = ArxivFetcher()
summarizer = None

try:
    summarizer = PaperSummarizer()
except ValueError as e:
    print(f"Warning: {e}")
    print("Summarizer will not be available. Please set ANTHROPIC_API_KEY in .env file")


@app.route('/')
def index():
    """Serve the main page"""
    return render_template('index.html')


@app.route('/api/search', methods=['GET'])
def search_papers():
    """
    Search for papers on arXiv

    Query parameters:
    - query: Search query string (default: "generative AI")
    - max_results: Maximum number of results (default: 10)
    """
    query = request.args.get('query', 'generative AI OR diffusion model OR large language model')
    max_results = int(request.args.get('max_results', 10))

    try:
        papers = fetcher.search_papers(query, max_results)
        return jsonify({
            'success': True,
            'papers': papers,
            'count': len(papers)
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/latest', methods=['GET'])
def get_latest_papers():
    """
    Get latest generative AI papers

    Query parameters:
    - max_results: Maximum number of results (default: 10)
    """
    max_results = int(request.args.get('max_results', 10))

    try:
        papers = fetcher.get_latest_ai_papers(max_results)
        return jsonify({
            'success': True,
            'papers': papers,
            'count': len(papers)
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/category/<category>', methods=['GET'])
def get_papers_by_category(category):
    """
    Get papers by arXiv category

    Path parameters:
    - category: arXiv category (e.g., cs.AI, cs.LG, cs.CV, cs.CL)

    Query parameters:
    - max_results: Maximum number of results (default: 10)
    """
    max_results = int(request.args.get('max_results', 10))

    try:
        papers = fetcher.search_by_category(category, max_results)
        return jsonify({
            'success': True,
            'papers': papers,
            'count': len(papers),
            'category': category
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/summarize', methods=['POST'])
def summarize_paper():
    """
    Summarize a single paper

    Request body:
    - paper: Paper dictionary with title, authors, summary, etc.
    """
    if not summarizer:
        return jsonify({
            'success': False,
            'error': 'Summarizer not initialized. Please set ANTHROPIC_API_KEY in .env file'
        }), 500

    try:
        paper = request.json.get('paper')
        if not paper:
            return jsonify({
                'success': False,
                'error': 'No paper data provided'
            }), 400

        summary = summarizer.summarize_paper(paper)
        return jsonify({
            'success': True,
            'summary': summary
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/summarize-multiple', methods=['POST'])
def summarize_multiple_papers():
    """
    Summarize multiple papers

    Request body:
    - papers: List of paper dictionaries
    """
    if not summarizer:
        return jsonify({
            'success': False,
            'error': 'Summarizer not initialized. Please set ANTHROPIC_API_KEY in .env file'
        }), 500

    try:
        papers = request.json.get('papers', [])
        if not papers:
            return jsonify({
                'success': False,
                'error': 'No papers provided'
            }), 400

        summaries = summarizer.summarize_multiple_papers(papers)
        return jsonify({
            'success': True,
            'summaries': summaries,
            'count': len(summaries)
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/compare', methods=['POST'])
def compare_papers():
    """
    Compare multiple papers

    Request body:
    - papers: List of paper dictionaries (minimum 2)
    """
    if not summarizer:
        return jsonify({
            'success': False,
            'error': 'Summarizer not initialized. Please set ANTHROPIC_API_KEY in .env file'
        }), 500

    try:
        papers = request.json.get('papers', [])
        if len(papers) < 2:
            return jsonify({
                'success': False,
                'error': 'At least 2 papers required for comparison'
            }), 400

        comparison = summarizer.compare_papers(papers)
        return jsonify({
            'success': True,
            'comparison': comparison
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'summarizer_available': summarizer is not None
    })


if __name__ == '__main__':
    port = int(os.getenv('PORT', 5000))
    debug = os.getenv('DEBUG', 'False').lower() == 'true'

    print(f"""
    ╔═══════════════════════════════════════════════════╗
    ║   AI Paper Summarizer Agent                       ║
    ║   論文調査・要約・図解エージェント                ║
    ╠═══════════════════════════════════════════════════╣
    ║   Server running on: http://localhost:{port}       ║
    ║   Summarizer: {'✓ Available' if summarizer else '✗ Not configured'}                        ║
    ╚═══════════════════════════════════════════════════╝
    """)

    app.run(host='0.0.0.0', port=port, debug=debug)
