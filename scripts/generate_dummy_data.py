#!/usr/bin/env python3
"""
Generate dummy purchase data for fresh food supermarket
100,000 rows with realistic patterns
"""

import csv
import random
from datetime import datetime, timedelta
from collections import defaultdict

# Configuration
NUM_ROWS = 100000
OUTPUT_FILE = "../public/data/purchase_history.csv"

# Stores
STORES = ["本店", "駅前店", "北口店", "南店"]

# Departments and products with price ranges
DEPARTMENTS = {
    "青果": {
        "products": [
            ("りんご", 100, 300),
            ("みかん", 80, 200),
            ("バナナ", 100, 200),
            ("キャベツ", 100, 250),
            ("レタス", 150, 300),
            ("トマト", 150, 400),
            ("きゅうり", 80, 150),
            ("にんじん", 80, 200),
            ("玉ねぎ", 100, 250),
            ("じゃがいも", 100, 300),
            ("ほうれん草", 150, 300),
            ("ブロッコリー", 150, 350),
            ("ねぎ", 100, 200),
            ("大根", 100, 250),
            ("もやし", 30, 50),
        ],
        "weight": 0.22,  # Purchase probability weight
    },
    "鮮魚": {
        "products": [
            ("サーモン刺身", 400, 800),
            ("まぐろ刺身", 500, 1200),
            ("鯛切身", 300, 600),
            ("さば切身", 200, 400),
            ("あじ開き", 200, 400),
            ("えび", 400, 900),
            ("いか", 250, 500),
            ("たこ", 300, 600),
            ("しらす", 200, 400),
            ("鮭切身", 250, 500),
        ],
        "weight": 0.12,
    },
    "精肉": {
        "products": [
            ("豚バラ肉", 300, 800),
            ("豚ロース", 400, 900),
            ("豚ひき肉", 200, 500),
            ("鶏もも肉", 300, 700),
            ("鶏むね肉", 200, 500),
            ("鶏ひき肉", 200, 450),
            ("牛バラ肉", 500, 1500),
            ("牛切り落とし", 400, 1200),
            ("牛ひき肉", 350, 800),
            ("合いびき肉", 250, 600),
            ("ベーコン", 200, 500),
            ("ソーセージ", 200, 450),
        ],
        "weight": 0.15,
    },
    "加工食品": {
        "products": [
            ("カップ麺", 100, 250),
            ("インスタント麺", 80, 200),
            ("レトルトカレー", 150, 400),
            ("缶詰ツナ", 100, 300),
            ("缶詰コーン", 100, 200),
            ("パスタ", 150, 350),
            ("パスタソース", 200, 450),
            ("醤油", 200, 500),
            ("味噌", 250, 600),
            ("めんつゆ", 200, 450),
            ("マヨネーズ", 200, 400),
            ("ケチャップ", 150, 350),
            ("ドレッシング", 200, 450),
            ("ふりかけ", 100, 300),
            ("お茶漬け", 150, 300),
        ],
        "weight": 0.18,
    },
    "デイリー": {
        "products": [
            ("牛乳", 150, 280),
            ("ヨーグルト", 100, 250),
            ("チーズ", 200, 500),
            ("バター", 300, 500),
            ("豆腐", 50, 150),
            ("納豆", 80, 150),
            ("卵", 200, 350),
            ("食パン", 100, 250),
            ("菓子パン", 100, 200),
            ("ハム", 200, 450),
            ("ちくわ", 80, 180),
            ("こんにゃく", 80, 150),
            ("漬物", 150, 350),
        ],
        "weight": 0.20,
    },
    "菓子": {
        "products": [
            ("ポテトチップス", 100, 250),
            ("チョコレート", 100, 350),
            ("クッキー", 150, 400),
            ("せんべい", 150, 350),
            ("飴", 100, 250),
            ("ガム", 100, 200),
            ("グミ", 100, 250),
            ("アイスクリーム", 150, 400),
            ("プリン", 100, 200),
            ("ケーキ", 300, 600),
            ("和菓子", 200, 450),
        ],
        "weight": 0.08,
    },
    "家庭用品": {
        "products": [
            ("ティッシュペーパー", 200, 500),
            ("トイレットペーパー", 300, 700),
            ("洗剤", 200, 600),
            ("柔軟剤", 250, 550),
            ("食器用洗剤", 150, 350),
            ("ラップ", 150, 400),
            ("アルミホイル", 150, 350),
            ("ゴミ袋", 150, 400),
            ("スポンジ", 100, 250),
            ("歯ブラシ", 100, 300),
            ("シャンプー", 300, 800),
        ],
        "weight": 0.05,
    },
}

# Member configuration
NUM_MEMBERS = 5000
MEMBER_TYPES = {
    "loyal": 0.15,      # High frequency shoppers
    "regular": 0.35,    # Medium frequency
    "occasional": 0.50, # Low frequency
}

# Date range: 1 year of data
START_DATE = datetime(2024, 1, 1)
END_DATE = datetime(2024, 12, 31)

def generate_member_id(index):
    return f"M{str(index).zfill(5)}"

def generate_transaction_id(date, index):
    return f"T{date.strftime('%Y%m%d')}{str(index).zfill(5)}"

def get_random_date():
    delta = END_DATE - START_DATE
    random_days = random.randint(0, delta.days)
    return START_DATE + timedelta(days=random_days)

def get_weighted_department():
    """Select department based on weights"""
    depts = list(DEPARTMENTS.keys())
    weights = [DEPARTMENTS[d]["weight"] for d in depts]
    return random.choices(depts, weights=weights, k=1)[0]

def get_random_product(department):
    """Select random product from department"""
    products = DEPARTMENTS[department]["products"]
    product_name, min_price, max_price = random.choice(products)
    price = random.randint(min_price, max_price)
    # Round to nearest 10
    price = round(price / 10) * 10
    return product_name, price

def generate_basket():
    """Generate a shopping basket (1 transaction)"""
    basket = []
    # Number of items in basket: weighted towards smaller baskets
    num_items = random.choices(
        [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        weights=[15, 20, 20, 15, 10, 8, 5, 3, 2, 2],
        k=1
    )[0]

    # Track departments to allow some repeat purchases
    for _ in range(num_items):
        dept = get_weighted_department()
        product, price = get_random_product(dept)
        qty = random.choices([1, 2, 3], weights=[70, 25, 5], k=1)[0]
        basket.append({
            "category": dept,
            "product": product,
            "qty": qty,
            "amount": price * qty
        })

    return basket

def apply_seasonality(date, department):
    """Apply seasonal effects to purchase probability"""
    month = date.month
    day_of_week = date.weekday()

    multiplier = 1.0

    # Weekend boost
    if day_of_week >= 5:
        multiplier *= 1.3

    # Seasonal effects
    if department == "青果":
        if month in [6, 7, 8]:  # Summer
            multiplier *= 1.2
    elif department == "鮮魚":
        if month in [12, 1]:  # Year end/New Year
            multiplier *= 1.4
    elif department == "精肉":
        if month in [12]:  # Year end
            multiplier *= 1.3
        if month in [7, 8]:  # BBQ season
            multiplier *= 1.2
    elif department == "菓子":
        if month in [2, 3, 12]:  # Valentine, White Day, Christmas
            multiplier *= 1.3
    elif department == "家庭用品":
        if month in [3, 4]:  # New fiscal year
            multiplier *= 1.2

    return multiplier

def main():
    print("Generating dummy purchase data...")

    # Create member purchase frequency profiles
    members = {}
    member_index = 1
    for member_type, ratio in MEMBER_TYPES.items():
        count = int(NUM_MEMBERS * ratio)
        for _ in range(count):
            member_id = generate_member_id(member_index)
            if member_type == "loyal":
                freq = random.randint(80, 150)  # Purchases per year
            elif member_type == "regular":
                freq = random.randint(30, 80)
            else:
                freq = random.randint(5, 30)
            members[member_id] = {"type": member_type, "freq": freq}
            member_index += 1

    # Generate transactions
    rows = []
    transaction_counter = defaultdict(int)

    # Distribute purchases across members based on frequency
    total_generated = 0
    iteration = 0
    max_iterations = 1000  # Safety limit

    while total_generated < NUM_ROWS and iteration < max_iterations:
        iteration += 1
        for member_id, profile in members.items():
            if total_generated >= NUM_ROWS:
                break

            # Probability of purchase this iteration
            prob = profile["freq"] / 365 * 3  # Adjusted for iterations
            if random.random() > prob:
                continue

            # Generate purchase
            date = get_random_date()
            store = random.choice(STORES)

            # Generate basket
            basket = generate_basket()

            # Create transaction ID
            transaction_counter[date.strftime('%Y%m%d')] += 1
            trans_id = generate_transaction_id(date, transaction_counter[date.strftime('%Y%m%d')])

            # Add items to rows
            for item in basket:
                if total_generated >= NUM_ROWS:
                    break
                rows.append({
                    "purchase_date": date.strftime('%Y-%m-%d'),
                    "member_id": member_id,
                    "store": store,
                    "category": item["category"],
                    "product": item["product"],
                    "qty": item["qty"],
                    "amount": item["amount"],
                    "transaction_id": trans_id,
                })
                total_generated += 1

        if iteration % 100 == 0:
            print(f"  Generated {total_generated} rows...")

    # Sort by date
    rows.sort(key=lambda x: x["purchase_date"])

    # Write to CSV
    print(f"Writing {len(rows)} rows to CSV...")
    with open(OUTPUT_FILE, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=[
            "purchase_date", "member_id", "store", "category",
            "product", "qty", "amount", "transaction_id"
        ])
        writer.writeheader()
        writer.writerows(rows)

    print(f"Done! Generated {len(rows)} rows")

    # Print summary statistics
    print("\n=== Summary Statistics ===")
    print(f"Total rows: {len(rows)}")
    print(f"Date range: {rows[0]['purchase_date']} to {rows[-1]['purchase_date']}")

    # Category distribution
    cat_counts = defaultdict(int)
    cat_amounts = defaultdict(int)
    for row in rows:
        cat_counts[row["category"]] += 1
        cat_amounts[row["category"]] += row["amount"]

    print("\nCategory Distribution:")
    for cat in sorted(cat_counts.keys()):
        pct = cat_counts[cat] / len(rows) * 100
        avg = cat_amounts[cat] / cat_counts[cat]
        print(f"  {cat}: {cat_counts[cat]} rows ({pct:.1f}%), avg amount: ¥{avg:.0f}")

    # Store distribution
    store_counts = defaultdict(int)
    for row in rows:
        store_counts[row["store"]] += 1

    print("\nStore Distribution:")
    for store in sorted(store_counts.keys()):
        pct = store_counts[store] / len(rows) * 100
        print(f"  {store}: {store_counts[store]} rows ({pct:.1f}%)")

if __name__ == "__main__":
    main()
