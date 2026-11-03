from app.features.text import containment, jaccard, levenshtein, shingles, tokenize


def test_tokenize_and_shingles():
    tokens = tokenize("The cache epoch is Inverted!")
    assert tokens[:3] == ["the", "cache", "epoch"]
    grams = shingles(tokens, 3)
    assert ("cache", "epoch", "is") in grams


def test_jaccard_and_containment():
    a = {"a", "b", "c"}
    b = {"b", "c", "d"}
    assert round(jaccard(a, b), 4) == 0.5
    assert round(containment(a, b), 4) == round(2 / 3, 4)


def test_levenshtein_bounded():
    assert levenshtein("receive", "recieve") == 2
    assert levenshtein("epoch", "epoch") == 0
    assert levenshtein("short", "a-very-different-token", cutoff=2) == 3
