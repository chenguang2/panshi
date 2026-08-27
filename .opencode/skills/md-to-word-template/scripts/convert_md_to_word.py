#!/usr/bin/env python3
"""以模板为基底，将 md 内容替换进模板文档。

流程: pandoc 转换 md -> 提取内容 -> 拼入模板 document.xml（保留封面/目录/分节/页眉页脚）。
边界全部动态计算，不依赖硬编码字节位置。
"""
import os
import re
import subprocess
import sys
import zipfile

TEMPLATE = os.environ.get('EMBRACE_TEMPLATE', "/mnt/z/Embrace文档模板-2024.docx")
TMP = "/tmp/opencode/_content.docx"
REF_DOC = "/tmp/opencode/_ref.docx"  # pandoc 参考文档（运行时从模板构建）

# pandoc 需要的样式映射（加到模板 styles.xml）
PANDOC_STYLES = """
<w:style w:type="paragraph" w:styleId="FirstParagraph"><w:name w:val="First Paragraph"/><w:basedOn w:val="a"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="BodyText"><w:name w:val="Body Text"/><w:basedOn w:val="a"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="BlockText"><w:name w:val="Block Text"/><w:basedOn w:val="a"/><w:pPr><w:ind w:left="420" w:firstLineChars="0" w:firstLine="0"/></w:pPr><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Compact"><w:name w:val="Compact"/><w:basedOn w:val="a"/><w:pPr><w:ind w:firstLineChars="0" w:firstLine="0"/></w:pPr><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="CaptionedFigure"><w:name w:val="Captioned Figure"/><w:basedOn w:val="a8"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="ImageCaption"><w:name w:val="Image Caption"/><w:basedOn w:val="a9"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="TableCaption"><w:name w:val="Table Caption"/><w:basedOn w:val="a9"/><w:qFormat/></w:style>
"""


def find_boundaries(tdoc):
    """动态定位模板 document.xml 的关键边界。"""
    # 1. 目 录 标题段落（找 目 和 录 文本 run）
    i_mu = tdoc.find('>目<')
    if i_mu == -1:
        i_mu = tdoc.find('目')
    i_lu = tdoc.find('录', i_mu)
    toc_head_end = tdoc.find('</w:p>', i_lu) + len('</w:p>')
    # 目 录 段落起点：往前找上一个 </w:p>
    toc_head_start = tdoc.rfind('<w:p ', 0, i_mu)
    if toc_head_start == -1:
        toc_head_start = tdoc.rfind('<w:p>', 0, i_mu)

    # 2. 封面节结束：目 录 段落之前最后一个段落级 sectPr
    cover_area = tdoc[:toc_head_start]
    last_sect = cover_area.rfind('<w:sectPr')
    # 该 sectPr 所在段落结束
    sect_end = cover_area.find('</w:sectPr>', last_sect) + len('</w:sectPr>')
    para_end = cover_area.find('</w:p>', sect_end) + len('</w:p>')
    cover_end = para_end

    # 3. 内容节分节符：目 录 之后第一个含 headerReference 的段落级 sectPr
    toc_after = tdoc[toc_head_end:]
    hdr_idx = toc_after.find('headerReference')
    if hdr_idx == -1:
        raise RuntimeError('未找到内容节分节符')
    hdr_idx += toc_head_end
    sect_break_start = tdoc.rfind('<w:p ', 0, hdr_idx)
    if sect_break_start == -1:
        sect_break_start = tdoc.rfind('<w:p>', 0, hdr_idx)
    sect_break_end = tdoc.find('</w:p>', hdr_idx) + len('</w:p>')

    # 4. 最终 body sectPr（到文档末尾，含 </w:body></w:document>）
    body_end = tdoc.rfind('</w:body>')
    final_sect_start = tdoc.rfind('<w:sectPr', 0, body_end)
    final_sect_end = len(tdoc)

    return {
        'cover_end': cover_end,
        'toc_head_start': toc_head_start,
        'toc_head_end': toc_head_end,
        'sect_break_start': sect_break_start,
        'sect_break_end': sect_break_end,
        'final_sect_start': final_sect_start,
        'final_sect_end': final_sect_end,
    }


def fix_tables(content):
    """表格后处理：套用模板表格格式（直接格式，保证渲染）。

    表头行: 蓝色底纹 0B699B + 白字加粗居中 + 1.5倍行距 + 宋体五号
    表体:   左对齐 + 1.15倍行距 + 宋体小五号
    边框:   蓝色 2F8EC1 单线
    """
    BLUE = '2F8EC1'
    HEADER_FILL = '0B699B'

    def fix_tbl(m):
        tbl = m.group(0)
        rows = re.findall(r'<w:tr[ >].*?</w:tr>', tbl, re.S)
        if not rows:
            return tbl

        # 1. 表格边框（蓝色单线）
        borders = (
            '<w:tblBorders>'
            f'<w:top w:val="single" w:sz="4" w:space="0" w:color="{BLUE}"/>'
            f'<w:left w:val="single" w:sz="4" w:space="0" w:color="{BLUE}"/>'
            f'<w:bottom w:val="single" w:sz="4" w:space="0" w:color="{BLUE}"/>'
            f'<w:right w:val="single" w:sz="4" w:space="0" w:color="{BLUE}"/>'
            f'<w:insideH w:val="single" w:sz="4" w:space="0" w:color="{BLUE}"/>'
            f'<w:insideV w:val="single" w:sz="4" w:space="0" w:color="{BLUE}"/>'
            '</w:tblBorders>'
        )
        tbl = tbl.replace('<w:tblW ', borders + '<w:tblW ', 1)

        # 2. 表头行：蓝色底纹 + 白字加粗居中 + 1.5倍行距 + 五号
        header = rows[0]
        header = header.replace('<w:pStyle w:val="Compact"', '<w:pStyle w:val="aa"')
        header = header.replace('<w:jc w:val="left" />', '')
        # 单元格底纹
        header = re.sub(
            r'(<w:tc><w:tcPr />)',
            f'<w:tc><w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="{HEADER_FILL}"/></w:tcPr>',
            header)
        # 段落格式：居中 + 1.5倍行距
        header = header.replace(
            '<w:pPr><w:pStyle w:val="aa" /></w:pPr>',
            '<w:pPr><w:pStyle w:val="aa" /><w:spacing w:line="360" w:lineRule="auto" /><w:jc w:val="center" /></w:pPr>')
        # 文字：白色加粗五号
        header = re.sub(
            r'<w:r><w:t ',
            '<w:r><w:rPr><w:rFonts w:ascii="宋体" w:eastAsia="宋体" w:hAnsi="宋体" /><w:b /><w:color w:val="FFFFFF" /><w:sz w:val="21" /></w:rPr><w:t ',
            header)
        new_tbl = tbl.replace(rows[0], header)

        # 3. 表体行：左对齐 + 1.15倍行距 + 小五号
        for r in rows[1:]:
            body = r.replace('<w:pStyle w:val="Compact"', '<w:pStyle w:val="ac"')
            body = body.replace(
                '<w:pPr><w:pStyle w:val="ac" />',
                '<w:pPr><w:pStyle w:val="ac" /><w:spacing w:line="276" w:lineRule="auto" />')
            body = re.sub(
                r'<w:r><w:t ',
                '<w:r><w:rPr><w:rFonts w:ascii="宋体" w:eastAsia="宋体" w:hAnsi="宋体" /><w:sz w:val="18" /></w:rPr><w:t ',
                body)
            new_tbl = new_tbl.replace(r, body)
        return new_tbl
    return re.sub(r'<w:tbl[ >].*?</w:tbl>', fix_tbl, content, flags=re.S)


def fix_code_boxes(content):
    """代码段后处理：把连续的「代码段」段落包进单行单列表格（代码框）。

    模板规则：代码框（单行单列表格）+ 代码段样式。
    """
    # 找连续的 ad 样式段落
    def wrap(m):
        paras = m.group(0)
        return (
            '<w:tbl><w:tblPr><w:tblStyle w:val="af4" /><w:tblW w:type="auto" w:w="0" />'
            '<w:tblLook w:firstRow="0" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="0" w:noVBand="0" w:val="0000" />'
            '</w:tblPr><w:tblGrid><w:gridCol w:w="8296" /></w:tblGrid>'
            '<w:tr><w:tc><w:tcPr />' + paras + '</w:tc></w:tr></w:tbl>'
        )
    # 匹配一个或多个连续的 ad 段落（中间无其他内容）
    pattern = re.compile(
        r'(?:<w:p><w:pPr><w:pStyle w:val="ad" />.*?</w:p>)+', re.S)
    return pattern.sub(wrap, content)


def build_reference_doc():
    """从模板构建 pandoc 参考文档：加样式映射 + 重命名代码段/文档表格 + 去标题编号。

    pandoc 需要这些样式名才能生成对应的样式引用。
    """
    with zipfile.ZipFile(TEMPLATE) as z:
        names = z.namelist()
        files = {n: z.read(n) for n in names}
    styles_xml = files['word/styles.xml'].decode('utf-8')
    styles_xml = styles_xml.replace('<w:name w:val="代码段"/>', '<w:name w:val="Source Code"/>')
    styles_xml = styles_xml.replace('<w:name w:val="文档表格"/>', '<w:name w:val="Table"/>')
    for i in range(1, 8):
        pat = re.compile(
            r'(<w:style [^>]*w:styleId="' + str(i) + r'"[^>]*>.*?)<w:numPr>.*?</w:numPr>(.*?</w:style>)',
            re.S)
        styles_xml, _ = pat.subn(r'\1\2', styles_xml)
    styles_xml = styles_xml.replace('</w:styles>', PANDOC_STYLES + '</w:styles>')
    files['word/styles.xml'] = styles_xml.encode('utf-8')
    with zipfile.ZipFile(REF_DOC, 'w', zipfile.ZIP_DEFLATED) as z:
        for n in names:
            z.writestr(n, files[n])


def fix_lists(content, num_xml, template_num_xml):
    """列表后处理：List Paragraph 样式 + 模板编号格式。

    1. 列表段落样式 Compact -> a7（List Paragraph，基于正文）
    2. pandoc 的 abstractNum 格式替换为模板格式：
       - 子弹列表 -> 模板 abstractNum 3（//，缩进 840/1260/1680）
       - 有序列表 -> 模板 abstractNum 5（%1)/%2)/%3.）
    """
    # 1. 列表段落样式 -> a7（List Paragraph），并去掉首行缩进（模板做法）
    # 情况 A：numPr 后有任意 pStyle（Compact/BlockText 等）
    content = re.sub(
        r'(<w:numPr>.*?</w:numPr>)<w:pStyle w:val="[^"]+" />',
        r'\1<w:pStyle w:val="a7" /><w:ind w:firstLineChars="0" w:firstLine="0" />',
        content, flags=re.S)
    # 情况 B：无 pStyle 的裸列表段落，补 a7 样式 + 缩进覆盖
    content = re.sub(
        r'(<w:numPr>.*?</w:numPr>)</w:pPr>',
        r'\1<w:pStyle w:val="a7" /><w:ind w:firstLineChars="0" w:firstLine="0" /></w:pPr>',
        content, flags=re.S)

    # 2. 提取模板 abstractNum 3（子弹）和 5（有序）的完整定义
    template_num_xml = template_num_xml.decode('utf-8')

    def get_abs(aid):
        m = re.search(
            r'<w:abstractNum w:abstractNumId="' + aid + r'"[^>]*>(.*?)</w:abstractNum>',
            template_num_xml, re.S)
        return m.group(1) if m else None

    bullet_body = get_abs('3')
    decimal_body = get_abs('5')

    # 3. 对 pandoc 的 abstractNum（模板没有的），按格式替换
    num_xml_str = num_xml.decode('utf-8')
    # 找出列表用到的 numId -> abstractNumId
    used_numids = set(re.findall(r'<w:numId w:val="(\d+)"', content))
    num_map = dict(re.findall(
        r'<w:num w:numId="(\d+)"[^>]*>.*?<w:abstractNumId w:val="(\d+)"',
        num_xml_str, re.S))
    # 模板自带的 abstractNum（0-13），不处理
    template_abs = set(re.findall(
        r'<w:abstractNum w:abstractNumId="(\d+)"', template_num_xml))

    for nid in used_numids:
        aid = num_map.get(nid)
        if not aid or aid in template_abs:
            continue  # 模板自带的编号不动
        m = re.search(
            r'<w:abstractNum w:abstractNumId="' + aid + r'"[^>]*>(.*?)</w:abstractNum>',
            num_xml_str, re.S)
        if not m:
            continue
        body = m.group(1)
        fmt = re.search(r'<w:numFmt w:val="([^"]+)"', body)
        if not fmt:
            continue
        if fmt.group(1) == 'bullet' and bullet_body:
            num_xml_str = num_xml_str.replace(m.group(0),
                f'<w:abstractNum w:abstractNumId="{aid}">{bullet_body}</w:abstractNum>')
        elif fmt.group(1) == 'decimal' and decimal_body:
            num_xml_str = num_xml_str.replace(m.group(0),
                f'<w:abstractNum w:abstractNumId="{aid}">{decimal_body}</w:abstractNum>')

    return content, num_xml_str.encode('utf-8')


def fix_figures(content, chapter_num):
    """图形/图注后处理：套用模板格式 + 图注自动编号。

    图形: 居中显示，无缩进
    图注: 居中显示，无缩进，1.5倍行距，宋体五号，加粗
    图注自动编号: 图 {章节}-{SEQ} {文字}（Word 题注字段，F9 更新）
    """
    # 1. 图形段落（CaptionedFigure）：居中 + 无缩进（去掉可能的列表编号）
    content = re.sub(
        r'<w:pPr>(?:<w:numPr>(?:<w:[^>]*/>)*</w:numPr>)?<w:pStyle w:val="CaptionedFigure" /></w:pPr>',
        '<w:pPr><w:pStyle w:val="CaptionedFigure" />'
        '<w:ind w:firstLineChars="0" w:firstLine="0" /><w:jc w:val="center" /></w:pPr>',
        content, flags=re.S)

    # 2. 图注段落（ImageCaption）：居中 + 无缩进 + 1.5倍行距 + 宋体五号加粗
    content = re.sub(
        r'<w:pPr>(?:<w:numPr>(?:<w:[^>]*/>)*</w:numPr>)?<w:pStyle w:val="ImageCaption" /></w:pPr>',
        '<w:pPr><w:pStyle w:val="ImageCaption" />'
        '<w:ind w:firstLineChars="0" w:firstLine="0" /><w:jc w:val="center" />'
        '<w:spacing w:line="360" w:lineRule="auto" /></w:pPr>',
        content, flags=re.S)

    # 3. 图注文字替换为题注字段（自动编号），仅处理 ImageCaption 段落
    CAP_RPR = ('<w:rPr><w:rFonts w:ascii="宋体" w:eastAsia="宋体" w:hAnsi="宋体" />'
               '<w:b /><w:sz w:val="21" /></w:rPr>')

    def caption_field(m):
        rpr = m.group(1) or CAP_RPR  # 保留原有 run 格式，无则用默认
        text = m.group(2)
        return (
            f'<w:r>{rpr}<w:t xml:space="preserve">图 {chapter_num}-</w:t></w:r>'
            f'<w:r>{rpr}<w:fldChar w:fldCharType="begin" w:dirty="true"/></w:r>'
            f'<w:r>{rpr}<w:instrText xml:space="preserve"> SEQ 图 \\* ARABIC </w:instrText></w:r>'
            f'<w:r>{rpr}<w:fldChar w:fldCharType="separate"/></w:r>'
            f'<w:r>{rpr}<w:t>1</w:t></w:r>'
            f'<w:r>{rpr}<w:fldChar w:fldCharType="end"/></w:r>'
            f'<w:r>{rpr}<w:t xml:space="preserve"> {text}</w:t></w:r>'
        )

    def fix_caption_para(m):
        para = m.group(0)
        return re.sub(
            r'<w:r>(<w:rPr>.*?</w:rPr>)?<w:t xml:space="preserve">([^<]*)</w:t></w:r>',
            caption_field, para, flags=re.S)

    content = re.sub(
        r'<w:p><w:pPr><w:pStyle w:val="ImageCaption" />.*?</w:p>',
        fix_caption_para, content, flags=re.S)
    return content


def fix_table_captions(content, chapter_num):
    """表格表注：在真表格（Table 样式，非代码框）上方插入表注。

    表注: 居中显示，无缩进，1.5倍行距，宋体五号，加粗
    自动编号: 表 {章节}-{SEQ 表}
    """
    CAP_RPR = ('<w:rPr><w:rFonts w:ascii="宋体" w:eastAsia="宋体" w:hAnsi="宋体" />'
               '<w:b /><w:sz w:val="21" /></w:rPr>')
    caption = (
        '<w:p><w:pPr><w:pStyle w:val="TableCaption" />'
        '<w:ind w:firstLineChars="0" w:firstLine="0" /><w:jc w:val="center" />'
        '<w:spacing w:line="360" w:lineRule="auto" /></w:pPr>'
        f'<w:r>{CAP_RPR}<w:t xml:space="preserve">表 {chapter_num}-</w:t></w:r>'
        f'<w:r>{CAP_RPR}<w:fldChar w:fldCharType="begin" w:dirty="true"/></w:r>'
        f'<w:r>{CAP_RPR}<w:instrText xml:space="preserve"> SEQ 表 \\* ARABIC </w:instrText></w:r>'
        f'<w:r>{CAP_RPR}<w:fldChar w:fldCharType="separate"/></w:r>'
        f'<w:r>{CAP_RPR}<w:t>1</w:t></w:r>'
        f'<w:r>{CAP_RPR}<w:fldChar w:fldCharType="end"/></w:r>'
        '</w:p>'
    )

    def fix_tbl(m):
        tbl = m.group(0)
        # 只给真表格（Table 样式）加表注，代码框（af4）不加
        if '<w:tblStyle w:val="Table"' in tbl:
            return caption + tbl
        return tbl
    return re.sub(r'<w:tbl[ >].*?</w:tbl>', fix_tbl, content, flags=re.S)


def convert_md(md_file):
    md_dir = os.path.dirname(os.path.abspath(md_file))
    subprocess.run(['pandoc', os.path.basename(md_file), '-o', TMP,
                    '--reference-doc', REF_DOC, '--no-highlight'],
                   check=True, capture_output=True, cwd=md_dir)


def main(md_file, out_docx, title='磐石 Admin', subtitle='操作手册'):
    # 0. 构建 pandoc 参考文档
    build_reference_doc()

    # 1. pandoc 转换
    convert_md(md_file)

    # 2. 读取 pandoc 输出
    with zipfile.ZipFile(TMP) as z:
        pdoc = z.read('word/document.xml').decode('utf-8')
        prels = z.read('word/_rels/document.xml.rels').decode('utf-8')
        pnum = z.read('word/numbering.xml')
        pmedia = {n: z.read(n) for n in z.namelist() if n.startswith('word/media/')}

    # 3. 读取模板包
    with zipfile.ZipFile(TEMPLATE) as z:
        names = z.namelist()
        files = {n: z.read(n) for n in names}
        template_num_xml = z.read('word/numbering.xml')
    tdoc = files['word/document.xml'].decode('utf-8')

    # 4. 修改模板 styles.xml（加 pandoc 样式映射 + 重命名代码段/文档表格）
    styles_xml = files['word/styles.xml'].decode('utf-8')
    styles_xml = styles_xml.replace('<w:name w:val="代码段"/>', '<w:name w:val="Source Code"/>')
    styles_xml = styles_xml.replace('<w:name w:val="文档表格"/>', '<w:name w:val="Table"/>')
    # 去掉标题自动编号（避免与 md 手动编号双重编号）
    for i in range(1, 8):
        pat = re.compile(
            r'(<w:style [^>]*w:styleId="' + str(i) + r'"[^>]*>.*?)<w:numPr>.*?</w:numPr>(.*?</w:style>)',
            re.S)
        styles_xml, _ = pat.subn(r'\1\2', styles_xml)
    styles_xml = styles_xml.replace('</w:styles>', PANDOC_STYLES + '</w:styles>')
    files['word/styles.xml'] = styles_xml.encode('utf-8')

    # 4b. 修改 header4.xml（内容节页眉）
    hdr = files['word/header4.xml'].decode('utf-8')
    hdr = hdr.replace('Embrace XXXXXX', title)
    hdr = hdr.replace('用户使用手册', subtitle)
    files['word/header4.xml'] = hdr.encode('utf-8')

    # 5. 提取 pandoc 内容（body 内、最终 sectPr 前）
    body_start = pdoc.find('<w:body>') + len('<w:body>')
    sect_start = pdoc.rfind('<w:sectPr')
    content = pdoc[body_start:sect_start]

    # 6. 去掉超链接包装（保留文字，跨章节链接在 Word 中无意义）
    content = re.sub(r'<w:hyperlink [^>]*>', '', content)
    content = content.replace('</w:hyperlink>', '')

    # 6b. 表格后处理：表头/表体套用模板样式
    content = fix_tables(content)

    # 6c. 代码段包进代码框（单行单列表格）
    content = fix_code_boxes(content)

    # 6d. 列表：List Paragraph 样式 + 模板编号格式
    content, pnum = fix_lists(content, pnum, template_num_xml)

    # 6e. 图形/图注：居中无缩进 + 图注宋体五号加粗 + 自动编号
    chapter_num = str(int(os.path.basename(md_file).split('-')[0]))
    content = fix_figures(content, chapter_num)

    # 6f. 表格表注：真表格上方插入表注（自动编号）
    content = fix_table_captions(content, chapter_num)

    # 7. 重映射 pandoc 内容用到的 rId（图片/超链接）到 rId100+
    used = set(re.findall(r'r:(?:embed|id)="(rId\d+)"', content))
    remap = {}
    new_id = 100
    for rid in sorted(used, key=lambda x: int(x[3:])):
        remap[rid] = f'rId{new_id}'
        new_id += 1
    for old, new in remap.items():
        content = content.replace(f'"{old}"', f'"{new}"')

    # 8. 构建新 rels：模板 rels + pandoc 图片/超链接关系（重映射）
    rels = files['word/_rels/document.xml.rels'].decode('utf-8')
    for m in re.finditer(r'<Relationship [^>]*/>', prels):
        r = m.group(0)
        rid_m = re.search(r'Id="(rId\d+)"', r)
        if rid_m and rid_m.group(1) in remap:
            r = r.replace(f'Id="{rid_m.group(1)}"', f'Id="{remap[rid_m.group(1)]}"')
            rels = rels.replace('</Relationships>', r + '</Relationships>')

    # 9. 合并 pandoc media 文件（重命名避免与模板 media 冲突）
    media_remap = {}
    for n, data in pmedia.items():
        new_name = n.replace('image', 'md')
        media_remap[n] = new_name
        files[new_name] = data
        names.append(new_name)
    # 更新 rels 中 media 目标
    for old, new in media_remap.items():
        rels = rels.replace(f'Target="{old}"', f'Target="{new}"')

    # 10. 构建新 document.xml
    b = find_boundaries(tdoc)
    toc_field = (
        '<w:p><w:pPr><w:pStyle w:val="TOC1"/></w:pPr>'
        '<w:r><w:fldChar w:fldCharType="begin" w:dirty="true"/></w:r>'
        '<w:r><w:instrText xml:space="preserve"> TOC \\o "1-3" \\h \\z \\u </w:instrText></w:r>'
        '<w:r><w:fldChar w:fldCharType="separate"/></w:r>'
        '<w:r><w:t>（打开文档后按 F9 更新目录）</w:t></w:r>'
        '<w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>'
    )
    page_break = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'

    # 封面标题替换
    cover = tdoc[0:b['cover_end']]
    cover = cover.replace('Embrace XXXXXX', title)
    cover = cover.replace('用户使用手册', subtitle)

    new_doc = (
        cover +                                  # 封面节（含 sectPr）
        tdoc[b['toc_head_start']:b['toc_head_end']] +  # 目 录 标题段落
        toc_field + page_break +                 # TOC 字段 + 分页
        tdoc[b['sect_break_start']:b['sect_break_end']] +  # 内容节分节符
        content +                                # md 内容
        tdoc[b['final_sect_start']:b['final_sect_end']]    # 最终 body sectPr
    )
    files['word/document.xml'] = new_doc.encode('utf-8')
    files['word/_rels/document.xml.rels'] = rels.encode('utf-8')
    files['word/numbering.xml'] = pnum

    # 10.5 补命名空间声明（pandoc 内容用到的 drawingml 前缀）
    root_end = new_doc.find('>', new_doc.find('<w:document'))
    declared = set(re.findall(r'xmlns:(\w+)=', new_doc[:root_end + 1]))
    used = set(re.findall(r'(?:<|\s)(\w+):', new_doc))
    missing = used - declared - {'http', 'xml', 'xmlns'}
    ns_map = {
        'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
        'pic': 'http://schemas.openxmlformats.org/drawingml/2006/picture',
        'a14': 'http://schemas.microsoft.com/office/drawing/2010/main',
        'wp14': 'http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing',
    }
    if missing:
        add = ''.join(f' xmlns:{p}="{ns_map[p]}"' for p in missing if p in ns_map)
        new_doc = new_doc[:root_end] + add + new_doc[root_end:]
        files['word/document.xml'] = new_doc.encode('utf-8')
        print(f'补命名空间: {sorted(missing)}')

    # 10.6 修复 Content_Types：模板类型 -> 文档类型
    ct = files['[Content_Types].xml'].decode('utf-8')
    ct = ct.replace('wordprocessingml.template.main+xml', 'wordprocessingml.document.main+xml')
    files['[Content_Types].xml'] = ct.encode('utf-8')
    print('Content_Types: template -> document')

    # 10.7 打开时自动更新字段（图注 SEQ 编号、目录）
    settings = files['word/settings.xml'].decode('utf-8')
    if '<w:updateFields' not in settings:
        settings = settings.replace('</w:settings>', '<w:updateFields w:val="true"/></w:settings>')
        files['word/settings.xml'] = settings.encode('utf-8')
        print('settings: 打开时自动更新字段')

    # 11. 写回
    with zipfile.ZipFile(out_docx, 'w', zipfile.ZIP_DEFLATED) as z:
        for n in names:
            z.writestr(n, files[n])
    print(f'完成: {out_docx}')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])