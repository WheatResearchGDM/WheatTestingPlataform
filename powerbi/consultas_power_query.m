// Parâmetro lógico usado por todas as consultas.
// O relatório permanece conectado ao mesmo Excel fornecido pelo usuário.
FonteExcel = "C:\Users\ipaula\Downloads\template_rede_ensaios_rs.xlsx";

// Consulta LOCAIS
let
    Fonte = Excel.Workbook(File.Contents(FonteExcel), null, true),
    Aba = Fonte{[Item="LOCAIS",Kind="Sheet"]}[Data],
    SemTitulo = Table.Skip(Aba, 1),
    Cabecalhos = Table.PromoteHeaders(SemTitulo, [PromoteAllScalars=true]),
    Tipos = Table.TransformColumnTypes(Cabecalhos, {
        {"local_id*", type text}, {"nome_local*", type text}, {"municipio*", type text},
        {"uf*", type text}, {"latitude*", type number}, {"longitude*", type number},
        {"regiao", type text}, {"instituicao/parceiro", type text},
        {"responsavel_local", type text}, {"ativo", type text}, {"observacoes", type text}
    }),
    LinhasValidas = Table.SelectRows(Tipos, each [#"local_id*"] <> null and [#"local_id*"] <> "")
in
    LinhasValidas;

// Consulta ENSAIOS
let
    Fonte = Excel.Workbook(File.Contents(FonteExcel), null, true),
    Aba = Fonte{[Item="ENSAIOS",Kind="Sheet"]}[Data],
    SemTitulo = Table.Skip(Aba, 1),
    Cabecalhos = Table.PromoteHeaders(SemTitulo, [PromoteAllScalars=true]),
    Tipos = Table.TransformColumnTypes(Cabecalhos, {
        {"ensaio_id*", type text}, {"nome_ensaio*", type text}, {"tipo_ensaio*", type text},
        {"ano*", Int64.Type}, {"ciclo", type text}, {"local_id*", type text},
        {"n_parcelas*", Int64.Type}, {"data_semeadura", type date},
        {"colheita_prevista", type date}, {"responsavel*", type text},
        {"status", type text}, {"prioridade", type text}, {"observacoes", type text}
    }),
    LinhasValidas = Table.SelectRows(Tipos, each [#"ensaio_id*"] <> null and [#"ensaio_id*"] <> "")
in
    LinhasValidas;

// Consulta PLANEJAMENTO
let
    Fonte = Excel.Workbook(File.Contents(FonteExcel), null, true),
    Aba = Fonte{[Item="PLANEJAMENTO",Kind="Sheet"]}[Data],
    SemTitulo = Table.Skip(Aba, 1),
    Cabecalhos = Table.PromoteHeaders(SemTitulo, [PromoteAllScalars=true]),
    Tipos = Table.TransformColumnTypes(Cabecalhos, {
        {"atividade_id*", type text}, {"ensaio_id*", type text}, {"atividade*", type text},
        {"categoria", type text}, {"data_inicio_planejada*", type date},
        {"data_fim_planejada", type date}, {"responsavel", type text},
        {"prioridade", type text}, {"status_planejado", type text}, {"observacoes", type text}
    }),
    LinhasValidas = Table.SelectRows(Tipos, each [#"atividade_id*"] <> null and [#"atividade_id*"] <> "")
in
    LinhasValidas;

// Consulta ATIVIDADES_REALIZADAS
let
    Fonte = Excel.Workbook(File.Contents(FonteExcel), null, true),
    Aba = Fonte{[Item="ATIVIDADES_REALIZADAS",Kind="Sheet"]}[Data],
    SemTitulo = Table.Skip(Aba, 1),
    Cabecalhos = Table.PromoteHeaders(SemTitulo, [PromoteAllScalars=true]),
    Tipos = Table.TransformColumnTypes(Cabecalhos, {
        {"registro_id*", type text}, {"ensaio_id*", type text}, {"atividade_id_planejada", type text},
        {"data_realizada*", type date}, {"atividade*", type text}, {"categoria", type text},
        {"produto", type text}, {"dose", type text}, {"estadio", type text},
        {"responsavel*", type text}, {"observacoes", type text}, {"usuario_email", type text},
        {"timestamp_registro", type text}, {"latitude_registro", type number},
        {"longitude_registro", type number}
    }),
    LinhasValidas = Table.SelectRows(Tipos, each [#"registro_id*"] <> null and [#"registro_id*"] <> "")
in
    LinhasValidas;

// Consulta USUARIOS
let
    Fonte = Excel.Workbook(File.Contents(FonteExcel), null, true),
    Aba = Fonte{[Item="USUARIOS",Kind="Sheet"]}[Data],
    SemTitulo = Table.Skip(Aba, 1),
    Cabecalhos = Table.PromoteHeaders(SemTitulo, [PromoteAllScalars=true]),
    Tipos = Table.TransformColumnTypes(Cabecalhos, {
        {"usuario_id*", type text}, {"nome*", type text}, {"email_google*", type text},
        {"perfil*", type text}, {"ativo*", type text}, {"locais_permitidos", type text},
        {"observacoes", type text}
    }),
    LinhasValidas = Table.SelectRows(Tipos, each [#"usuario_id*"] <> null and [#"usuario_id*"] <> "")
in
    LinhasValidas;
