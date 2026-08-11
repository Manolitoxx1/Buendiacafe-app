import sys

filepath = 'c:/Users/ojosp/Downloads/Buen dia Cafe/app.js'
with open(filepath, 'r', encoding='utf-8') as f:
    code = f.read()

lines = code.splitlines()
print(f"Total lines in app.js: {len(lines)}")

stack = []
pairs = {')': '(', '}': '{', ']': '['}

in_string = False
string_char = ''
in_multi_comment = False

for line_idx, line in enumerate(lines, 1):
    col_idx = 0
    while col_idx < len(line):
        char = line[col_idx]
        
        if in_multi_comment:
            if char == '*' and col_idx + 1 < len(line) and line[col_idx + 1] == '/':
                in_multi_comment = False
                col_idx += 1
            col_idx += 1
            continue

        if in_string:
            if char == string_char:
                # check escape
                escapes = 0
                k = col_idx - 1
                while k >= 0 and line[k] == '\\':
                    escapes += 1
                    k -= 1
                if escapes % 2 == 0:
                    in_string = False
            col_idx += 1
            continue

        # Check start of comments
        if char == '/' and col_idx + 1 < len(line):
            next_c = line[col_idx + 1]
            if next_c == '/':
                break # rest of line is comment
            elif next_c == '*':
                in_multi_comment = True
                col_idx += 2
                continue

        # Check strings
        if char in ('"', "'", '`'):
            in_string = True
            string_char = char
            col_idx += 1
            continue

        if char in '({[':
            stack.append((char, line_idx, col_idx + 1))
        elif char in ')}]':
            if not stack:
                print(f"ERROR: Extra closing '{char}' at line {line_idx}:{col_idx + 1}")
            else:
                top_char, top_line, top_col = stack.pop()
                expected = pairs[char]
                if top_char != expected:
                    print(f"ERROR: Mismatched '{char}' at line {line_idx}:{col_idx + 1}. Expected match for '{top_char}' from line {top_line}:{top_col}")
        
        col_idx += 1

if stack:
    print(f"ERROR: {len(stack)} unclosed brackets/parentheses remaining:")
    for item in stack[-10:]:
        print(f"  Unclosed '{item[0]}' from line {item[1]}:{item[2]}")
else:
    print("SUCCESS: All brackets, parentheses, and braces match perfectly!")
