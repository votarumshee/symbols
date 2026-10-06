SELECT category,COUNT(*) AS record_count FROM game_content GROUP BY category ORDER BY category;
SELECT COUNT(*) AS total_records FROM game_content;
SELECT COUNT(*) AS total_links FROM game_content_links;
SELECT COUNT(*) AS orphan_links FROM game_content_links l LEFT JOIN game_content c ON c.category=l.target_category AND c.item_key=l.target_key WHERE c.item_key IS NULL;
SELECT payload FROM game_content WHERE category='symbol' AND item_key='inspect';
PRAGMA integrity_check;
PRAGMA foreign_key_check;
