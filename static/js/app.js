// AI Paper Summarizer - Frontend JavaScript

// Initialize Mermaid
mermaid.initialize({
    startOnLoad: true,
    theme: 'dark',
    securityLevel: 'loose',
});

// State
let currentPapers = [];
let selectedPapers = [];

// API Base URL
const API_BASE = '';

// Search papers
async function searchPapers() {
    const query = document.getElementById('searchInput').value;
    const maxResults = document.getElementById('maxResults').value;

    if (!query.trim()) {
        alert('検索キーワードを入力してください');
        return;
    }

    showLoading(true);
    hideResults();

    try {
        const response = await fetch(`${API_BASE}/api/search?query=${encodeURIComponent(query)}&max_results=${maxResults}`);
        const data = await response.json();

        if (data.success) {
            currentPapers = data.papers;
            displayPapers(data.papers);
        } else {
            alert(`エラー: ${data.error}`);
        }
    } catch (error) {
        console.error('Search error:', error);
        alert('検索中にエラーが発生しました');
    } finally {
        showLoading(false);
    }
}

// Get latest papers
async function getLatestPapers() {
    const maxResults = document.getElementById('maxResults').value;

    showLoading(true);
    hideResults();

    try {
        const response = await fetch(`${API_BASE}/api/latest?max_results=${maxResults}`);
        const data = await response.json();

        if (data.success) {
            currentPapers = data.papers;
            displayPapers(data.papers);
        } else {
            alert(`エラー: ${data.error}`);
        }
    } catch (error) {
        console.error('Fetch error:', error);
        alert('論文の取得中にエラーが発生しました');
    } finally {
        showLoading(false);
    }
}

// Search by category
async function searchByCategory(category) {
    const maxResults = document.getElementById('maxResults').value;

    showLoading(true);
    hideResults();

    try {
        const response = await fetch(`${API_BASE}/api/category/${category}?max_results=${maxResults}`);
        const data = await response.json();

        if (data.success) {
            currentPapers = data.papers;
            displayPapers(data.papers);
        } else {
            alert(`エラー: ${data.error}`);
        }
    } catch (error) {
        console.error('Category search error:', error);
        alert('カテゴリ検索中にエラーが発生しました');
    } finally {
        showLoading(false);
    }
}

// Display papers
function displayPapers(papers) {
    const papersList = document.getElementById('papersList');
    const resultCount = document.getElementById('resultCount');
    const resultsSection = document.getElementById('resultsSection');

    papersList.innerHTML = '';
    resultCount.textContent = papers.length;

    papers.forEach((paper, index) => {
        const paperCard = createPaperCard(paper, index);
        papersList.appendChild(paperCard);
    });

    resultsSection.style.display = 'block';
}

// Create paper card HTML
function createPaperCard(paper, index) {
    const card = document.createElement('div');
    card.className = 'paper-card';

    const authorsText = paper.authors.slice(0, 3).join(', ') +
        (paper.authors.length > 3 ? ' et al.' : '');

    const categoriesHTML = paper.categories
        .slice(0, 3)
        .map(cat => `<span class="category-tag">${cat}</span>`)
        .join('');

    card.innerHTML = `
        <h3 class="paper-title">${escapeHtml(paper.title)}</h3>
        <div class="paper-meta">
            <span class="paper-authors">👥 ${escapeHtml(authorsText)}</span>
            <span class="paper-date">📅 ${paper.published}</span>
        </div>
        <div class="paper-categories">
            ${categoriesHTML}
        </div>
        <div class="paper-abstract" id="abstract-${index}">
            ${escapeHtml(paper.summary.substring(0, 300))}...
        </div>
        <div class="paper-actions">
            <button class="btn-small btn-summarize" onclick="summarizePaper(${index})">
                ✨ 要約する
            </button>
            <button class="btn-small btn-link" onclick="openPDF('${paper.pdf_url}')">
                📄 PDFを開く
            </button>
            <button class="btn-small btn-link" onclick="toggleAbstract(${index})">
                📖 全文表示
            </button>
        </div>
    `;

    return card;
}

// Toggle abstract expansion
function toggleAbstract(index) {
    const abstractDiv = document.getElementById(`abstract-${index}`);
    const paper = currentPapers[index];

    if (abstractDiv.classList.contains('expanded')) {
        abstractDiv.classList.remove('expanded');
        abstractDiv.textContent = paper.summary.substring(0, 300) + '...';
    } else {
        abstractDiv.classList.add('expanded');
        abstractDiv.textContent = paper.summary;
    }
}

// Summarize single paper
async function summarizePaper(index) {
    const paper = currentPapers[index];

    showLoading(true);

    try {
        const response = await fetch(`${API_BASE}/api/summarize`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ paper: paper }),
        });

        const data = await response.json();

        if (data.success) {
            displaySummary(data.summary);
        } else {
            alert(`エラー: ${data.error}`);
        }
    } catch (error) {
        console.error('Summarize error:', error);
        alert('要約中にエラーが発生しました');
    } finally {
        showLoading(false);
    }
}

// Summarize all papers
async function summarizeAllPapers() {
    if (currentPapers.length === 0) {
        alert('要約する論文がありません');
        return;
    }

    if (!confirm(`${currentPapers.length}件の論文を要約しますか？\n(これには時間がかかる場合があります)`)) {
        return;
    }

    const summarizeAllBtn = document.getElementById('summarizeAllBtn');
    summarizeAllBtn.disabled = true;
    summarizeAllBtn.textContent = '要約中...';

    try {
        const response = await fetch(`${API_BASE}/api/summarize-multiple`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ papers: currentPapers }),
        });

        const data = await response.json();

        if (data.success) {
            displayMultipleSummaries(data.summaries);
        } else {
            alert(`エラー: ${data.error}`);
        }
    } catch (error) {
        console.error('Batch summarize error:', error);
        alert('一括要約中にエラーが発生しました');
    } finally {
        summarizeAllBtn.disabled = false;
        summarizeAllBtn.textContent = '✨ 全ての論文を要約';
    }
}

// Display single summary in modal
function displaySummary(summary) {
    const modal = document.getElementById('summaryModal');
    const content = document.getElementById('summaryContent');

    let html = `
        <h1>${escapeHtml(summary.title)}</h1>
        <div class="paper-meta" style="margin-bottom: 20px;">
            <span class="paper-authors">👥 ${escapeHtml(summary.authors.slice(0, 5).join(', '))}</span>
            <span class="paper-date">📅 ${summary.published}</span>
        </div>
        <div style="margin-bottom: 20px;">
            <a href="${summary.pdf_url}" target="_blank" class="btn btn-link">📄 PDFを開く</a>
        </div>
    `;

    // Convert markdown summary to HTML
    const summaryHTML = marked.parse(summary.summary);
    html += summaryHTML;

    // Add mermaid diagram if available
    if (summary.mermaid_diagram) {
        html += `
            <h2>📊 アーキテクチャ図</h2>
            <div class="mermaid">
${summary.mermaid_diagram}
            </div>
        `;
    }

    content.innerHTML = html;

    // Re-initialize mermaid for the new diagram
    if (summary.mermaid_diagram) {
        setTimeout(() => {
            mermaid.init(undefined, document.querySelectorAll('.mermaid'));
        }, 100);
    }

    modal.style.display = 'block';
}

// Display multiple summaries
function displayMultipleSummaries(summaries) {
    const modal = document.getElementById('summaryModal');
    const content = document.getElementById('summaryContent');

    let html = '<h1>📚 論文要約一覧</h1>';

    summaries.forEach((summary, index) => {
        html += `
            <div style="margin-bottom: 40px; padding-bottom: 40px; border-bottom: 2px solid var(--border-color);">
                <h2>${index + 1}. ${escapeHtml(summary.title)}</h2>
                <div class="paper-meta" style="margin-bottom: 15px;">
                    <span class="paper-authors">👥 ${escapeHtml(summary.authors.slice(0, 3).join(', '))}</span>
                    <span class="paper-date">📅 ${summary.published}</span>
                </div>
                ${marked.parse(summary.summary)}
        `;

        if (summary.mermaid_diagram) {
            html += `
                <div class="mermaid">
${summary.mermaid_diagram}
                </div>
            `;
        }

        html += '</div>';
    });

    content.innerHTML = html;

    // Re-initialize mermaid
    setTimeout(() => {
        mermaid.init(undefined, document.querySelectorAll('.mermaid'));
    }, 100);

    modal.style.display = 'block';
}

// Close modal
function closeModal() {
    const modal = document.getElementById('summaryModal');
    modal.style.display = 'none';
}

// Open PDF in new tab
function openPDF(url) {
    window.open(url, '_blank');
}

// Show/hide loading indicator
function showLoading(show) {
    const loading = document.getElementById('loading');
    loading.style.display = show ? 'block' : 'none';
}

// Hide results section
function hideResults() {
    const resultsSection = document.getElementById('resultsSection');
    resultsSection.style.display = 'none';
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Handle Enter key in search input
document.addEventListener('DOMContentLoaded', function () {
    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            searchPapers();
        }
    });

    // Close modal when clicking outside
    window.onclick = function (event) {
        const modal = document.getElementById('summaryModal');
        if (event.target === modal) {
            closeModal();
        }
    };
});

// Auto-load latest papers on page load
window.addEventListener('load', function () {
    console.log('AI Paper Summarizer loaded');
    // Optionally auto-load papers
    // getLatestPapers();
});
