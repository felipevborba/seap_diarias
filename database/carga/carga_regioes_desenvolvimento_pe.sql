-- =====================================================================
-- Carga das 12 Regiões de Desenvolvimento de Pernambuco em comum.regiao / comum.regiao_municipio.
-- Fonte: Lei Complementar estadual 388/2018 (art. 1º) com LC 397/2018 (Pombos -> RD 08) e
-- LC 426/2020 (Goiana -> RD 11): https://legis.alepe.pe.gov.br/texto.aspx?id=37664
-- Grafias da lei ajustadas ao cadastro IBGE do banco: Belém do São Francisco -> Belém de São Francisco,
-- Iguaracy -> Iguaraci, Glória de Goitá -> Glória do Goitá, São Vicente Férrer -> São Vicente Ferrer.
--
-- Idempotente: não duplica regiões nem associações e não move municípios que já estejam em outra região.
-- Aborta (sem gravar) se algum município da lei não for encontrado ou se o resultado não tiver 185 municípios.
-- =====================================================================
BEGIN;

CREATE TEMP TABLE rd_carga (regiao text, municipio text) ON COMMIT DROP;
INSERT INTO rd_carga (regiao, municipio) VALUES
    ('RD 01 - Sertão de Itaparica', 'Belém de São Francisco'),
    ('RD 01 - Sertão de Itaparica', 'Carnaubeira da Penha'),
    ('RD 01 - Sertão de Itaparica', 'Floresta'),
    ('RD 01 - Sertão de Itaparica', 'Itacuruba'),
    ('RD 01 - Sertão de Itaparica', 'Jatobá'),
    ('RD 01 - Sertão de Itaparica', 'Petrolândia'),
    ('RD 01 - Sertão de Itaparica', 'Tacaratu'),
    ('RD 02 - Sertão do São Francisco', 'Afrânio'),
    ('RD 02 - Sertão do São Francisco', 'Cabrobó'),
    ('RD 02 - Sertão do São Francisco', 'Dormentes'),
    ('RD 02 - Sertão do São Francisco', 'Orocó'),
    ('RD 02 - Sertão do São Francisco', 'Petrolina'),
    ('RD 02 - Sertão do São Francisco', 'Santa Maria da Boa Vista'),
    ('RD 02 - Sertão do São Francisco', 'Lagoa Grande'),
    ('RD 03 - Sertão do Araripe', 'Araripina'),
    ('RD 03 - Sertão do Araripe', 'Bodocó'),
    ('RD 03 - Sertão do Araripe', 'Exu'),
    ('RD 03 - Sertão do Araripe', 'Granito'),
    ('RD 03 - Sertão do Araripe', 'Ipubi'),
    ('RD 03 - Sertão do Araripe', 'Moreilândia'),
    ('RD 03 - Sertão do Araripe', 'Ouricuri'),
    ('RD 03 - Sertão do Araripe', 'Santa Cruz'),
    ('RD 03 - Sertão do Araripe', 'Santa Filomena'),
    ('RD 03 - Sertão do Araripe', 'Trindade'),
    ('RD 04 - Sertão Central', 'Cedro'),
    ('RD 04 - Sertão Central', 'Mirandiba'),
    ('RD 04 - Sertão Central', 'Parnamirim'),
    ('RD 04 - Sertão Central', 'Salgueiro'),
    ('RD 04 - Sertão Central', 'São José do Belmonte'),
    ('RD 04 - Sertão Central', 'Serrita'),
    ('RD 04 - Sertão Central', 'Terra Nova'),
    ('RD 04 - Sertão Central', 'Verdejante'),
    ('RD 05 - Sertão do Pajeú', 'Afogados da Ingazeira'),
    ('RD 05 - Sertão do Pajeú', 'Brejinho'),
    ('RD 05 - Sertão do Pajeú', 'Calumbi'),
    ('RD 05 - Sertão do Pajeú', 'Carnaíba'),
    ('RD 05 - Sertão do Pajeú', 'Flores'),
    ('RD 05 - Sertão do Pajeú', 'Iguaraci'),
    ('RD 05 - Sertão do Pajeú', 'Ingazeira'),
    ('RD 05 - Sertão do Pajeú', 'Itapetim'),
    ('RD 05 - Sertão do Pajeú', 'Quixaba'),
    ('RD 05 - Sertão do Pajeú', 'Santa Cruz da Baixa Verde'),
    ('RD 05 - Sertão do Pajeú', 'Santa Terezinha'),
    ('RD 05 - Sertão do Pajeú', 'São José do Egito'),
    ('RD 05 - Sertão do Pajeú', 'Serra Talhada'),
    ('RD 05 - Sertão do Pajeú', 'Solidão'),
    ('RD 05 - Sertão do Pajeú', 'Tabira'),
    ('RD 05 - Sertão do Pajeú', 'Triunfo'),
    ('RD 05 - Sertão do Pajeú', 'Tuparetama'),
    ('RD 06 - Sertão do Moxotó', 'Arcoverde'),
    ('RD 06 - Sertão do Moxotó', 'Betânia'),
    ('RD 06 - Sertão do Moxotó', 'Custódia'),
    ('RD 06 - Sertão do Moxotó', 'Ibimirim'),
    ('RD 06 - Sertão do Moxotó', 'Inajá'),
    ('RD 06 - Sertão do Moxotó', 'Manari'),
    ('RD 06 - Sertão do Moxotó', 'Sertânia'),
    ('RD 07 - Agreste Meridional', 'Águas Belas'),
    ('RD 07 - Agreste Meridional', 'Angelim'),
    ('RD 07 - Agreste Meridional', 'Bom Conselho'),
    ('RD 07 - Agreste Meridional', 'Brejão'),
    ('RD 07 - Agreste Meridional', 'Buíque'),
    ('RD 07 - Agreste Meridional', 'Caetés'),
    ('RD 07 - Agreste Meridional', 'Calçado'),
    ('RD 07 - Agreste Meridional', 'Canhotinho'),
    ('RD 07 - Agreste Meridional', 'Capoeiras'),
    ('RD 07 - Agreste Meridional', 'Correntes'),
    ('RD 07 - Agreste Meridional', 'Garanhuns'),
    ('RD 07 - Agreste Meridional', 'Iati'),
    ('RD 07 - Agreste Meridional', 'Itaíba'),
    ('RD 07 - Agreste Meridional', 'Jucati'),
    ('RD 07 - Agreste Meridional', 'Jupi'),
    ('RD 07 - Agreste Meridional', 'Jurema'),
    ('RD 07 - Agreste Meridional', 'Lagoa do Ouro'),
    ('RD 07 - Agreste Meridional', 'Lajedo'),
    ('RD 07 - Agreste Meridional', 'Palmeirina'),
    ('RD 07 - Agreste Meridional', 'Paranatama'),
    ('RD 07 - Agreste Meridional', 'Pedra'),
    ('RD 07 - Agreste Meridional', 'Saloá'),
    ('RD 07 - Agreste Meridional', 'São João'),
    ('RD 07 - Agreste Meridional', 'Terezinha'),
    ('RD 07 - Agreste Meridional', 'Tupanatinga'),
    ('RD 07 - Agreste Meridional', 'Venturosa'),
    ('RD 08 - Agreste Central', 'Agrestina'),
    ('RD 08 - Agreste Central', 'Alagoinha'),
    ('RD 08 - Agreste Central', 'Altinho'),
    ('RD 08 - Agreste Central', 'Barra de Guabiraba'),
    ('RD 08 - Agreste Central', 'Belo Jardim'),
    ('RD 08 - Agreste Central', 'Bezerros'),
    ('RD 08 - Agreste Central', 'Bonito'),
    ('RD 08 - Agreste Central', 'Brejo da Madre de Deus'),
    ('RD 08 - Agreste Central', 'Cachoeirinha'),
    ('RD 08 - Agreste Central', 'Camocim de São Félix'),
    ('RD 08 - Agreste Central', 'Caruaru'),
    ('RD 08 - Agreste Central', 'Cupira'),
    ('RD 08 - Agreste Central', 'Gravatá'),
    ('RD 08 - Agreste Central', 'Ibirajuba'),
    ('RD 08 - Agreste Central', 'Jataúba'),
    ('RD 08 - Agreste Central', 'Lagoa dos Gatos'),
    ('RD 08 - Agreste Central', 'Panelas'),
    ('RD 08 - Agreste Central', 'Pesqueira'),
    ('RD 08 - Agreste Central', 'Poção'),
    ('RD 08 - Agreste Central', 'Pombos'),
    ('RD 08 - Agreste Central', 'Riacho das Almas'),
    ('RD 08 - Agreste Central', 'Sairé'),
    ('RD 08 - Agreste Central', 'Sanharó'),
    ('RD 08 - Agreste Central', 'São Bento do Una'),
    ('RD 08 - Agreste Central', 'São Caitano'),
    ('RD 08 - Agreste Central', 'São Joaquim do Monte'),
    ('RD 08 - Agreste Central', 'Tacaimbó'),
    ('RD 09 - Agreste Setentrional', 'Bom Jardim'),
    ('RD 09 - Agreste Setentrional', 'Casinhas'),
    ('RD 09 - Agreste Setentrional', 'Cumaru'),
    ('RD 09 - Agreste Setentrional', 'Feira Nova'),
    ('RD 09 - Agreste Setentrional', 'Frei Miguelinho'),
    ('RD 09 - Agreste Setentrional', 'João Alfredo'),
    ('RD 09 - Agreste Setentrional', 'Limoeiro'),
    ('RD 09 - Agreste Setentrional', 'Machados'),
    ('RD 09 - Agreste Setentrional', 'Orobó'),
    ('RD 09 - Agreste Setentrional', 'Passira'),
    ('RD 09 - Agreste Setentrional', 'Salgadinho'),
    ('RD 09 - Agreste Setentrional', 'São Vicente Ferrer'),
    ('RD 09 - Agreste Setentrional', 'Santa Cruz do Capibaribe'),
    ('RD 09 - Agreste Setentrional', 'Santa Maria do Cambucá'),
    ('RD 09 - Agreste Setentrional', 'Surubim'),
    ('RD 09 - Agreste Setentrional', 'Taquaritinga do Norte'),
    ('RD 09 - Agreste Setentrional', 'Toritama'),
    ('RD 09 - Agreste Setentrional', 'Vertente do Lério'),
    ('RD 09 - Agreste Setentrional', 'Vertentes'),
    ('RD 10 - Mata Sul', 'Água Preta'),
    ('RD 10 - Mata Sul', 'Amaraji'),
    ('RD 10 - Mata Sul', 'Barreiros'),
    ('RD 10 - Mata Sul', 'Belém de Maria'),
    ('RD 10 - Mata Sul', 'Catende'),
    ('RD 10 - Mata Sul', 'Chã Grande'),
    ('RD 10 - Mata Sul', 'Cortês'),
    ('RD 10 - Mata Sul', 'Escada'),
    ('RD 10 - Mata Sul', 'Gameleira'),
    ('RD 10 - Mata Sul', 'Jaqueira'),
    ('RD 10 - Mata Sul', 'Joaquim Nabuco'),
    ('RD 10 - Mata Sul', 'Maraial'),
    ('RD 10 - Mata Sul', 'Palmares'),
    ('RD 10 - Mata Sul', 'Primavera'),
    ('RD 10 - Mata Sul', 'Quipapá'),
    ('RD 10 - Mata Sul', 'Ribeirão'),
    ('RD 10 - Mata Sul', 'Rio Formoso'),
    ('RD 10 - Mata Sul', 'São Benedito do Sul'),
    ('RD 10 - Mata Sul', 'São José da Coroa Grande'),
    ('RD 10 - Mata Sul', 'Sirinhaém'),
    ('RD 10 - Mata Sul', 'Tamandaré'),
    ('RD 10 - Mata Sul', 'Vitória de Santo Antão'),
    ('RD 10 - Mata Sul', 'Xexéu'),
    ('RD 11 - Mata Norte', 'Aliança'),
    ('RD 11 - Mata Norte', 'Buenos Aires'),
    ('RD 11 - Mata Norte', 'Camutanga'),
    ('RD 11 - Mata Norte', 'Carpina'),
    ('RD 11 - Mata Norte', 'Chã de Alegria'),
    ('RD 11 - Mata Norte', 'Condado'),
    ('RD 11 - Mata Norte', 'Ferreiros'),
    ('RD 11 - Mata Norte', 'Glória do Goitá'),
    ('RD 11 - Mata Norte', 'Goiana'),
    ('RD 11 - Mata Norte', 'Itaquitinga'),
    ('RD 11 - Mata Norte', 'Itambé'),
    ('RD 11 - Mata Norte', 'Lagoa do Carro'),
    ('RD 11 - Mata Norte', 'Lagoa de Itaenga'),
    ('RD 11 - Mata Norte', 'Macaparana'),
    ('RD 11 - Mata Norte', 'Nazaré da Mata'),
    ('RD 11 - Mata Norte', 'Paudalho'),
    ('RD 11 - Mata Norte', 'Timbaúba'),
    ('RD 11 - Mata Norte', 'Tracunhaém'),
    ('RD 11 - Mata Norte', 'Vicência'),
    ('RD 12 - Metropolitana', 'Abreu e Lima'),
    ('RD 12 - Metropolitana', 'Araçoiaba'),
    ('RD 12 - Metropolitana', 'Cabo de Santo Agostinho'),
    ('RD 12 - Metropolitana', 'Camaragibe'),
    ('RD 12 - Metropolitana', 'Igarassu'),
    ('RD 12 - Metropolitana', 'Ipojuca'),
    ('RD 12 - Metropolitana', 'Itamaracá'),
    ('RD 12 - Metropolitana', 'Itapissuma'),
    ('RD 12 - Metropolitana', 'Jaboatão dos Guararapes'),
    ('RD 12 - Metropolitana', 'Moreno'),
    ('RD 12 - Metropolitana', 'Olinda'),
    ('RD 12 - Metropolitana', 'Paulista'),
    ('RD 12 - Metropolitana', 'Recife'),
    ('RD 12 - Metropolitana', 'São Lourenço da Mata'),
    ('RD 12 - Metropolitana', 'Fernando de Noronha');

DO $$
DECLARE faltando text;
BEGIN
    SELECT string_agg(c.municipio, ', ') INTO faltando FROM rd_carga c
    WHERE NOT EXISTS (SELECT 1 FROM public.tabnaturalidade n JOIN public.tabuf u ON u.id = n.uf_id AND u.sigla = 'PE'
                      WHERE lower(n.nome) = lower(c.municipio));
    IF faltando IS NOT NULL THEN RAISE EXCEPTION 'Municípios não encontrados em tabnaturalidade/PE: %', faltando; END IF;
END $$;

INSERT INTO comum.regiao (nome)
SELECT DISTINCT c.regiao FROM rd_carga c
WHERE NOT EXISTS (SELECT 1 FROM comum.regiao r WHERE lower(r.nome) = lower(c.regiao));

INSERT INTO comum.regiao_municipio (regiao_id, municipio_id)
SELECT r.id, n.id
FROM rd_carga c
JOIN comum.regiao r ON lower(r.nome) = lower(c.regiao)
JOIN public.tabnaturalidade n ON lower(n.nome) = lower(c.municipio)
JOIN public.tabuf u ON u.id = n.uf_id AND u.sigla = 'PE'
ON CONFLICT DO NOTHING;

DO $$
DECLARE total int;
BEGIN
    SELECT count(*) INTO total FROM comum.regiao_municipio rm JOIN comum.regiao r ON r.id = rm.regiao_id WHERE r.nome LIKE 'RD __ - %';
    IF total <> 185 THEN RAISE EXCEPTION 'Esperados 185 municípios nas RDs, encontrados %', total; END IF;
END $$;

INSERT INTO comum.auditoria (modulo, entidade, entidade_id, raiz_entidade, raiz_id, acao, usuario_nome, alteracoes)
VALUES ('DIARIAS', 'regiao', 'RD01-RD12', 'regiao', 'carga_rd_pe', 'INCLUSAO', 'Carga inicial (LC 388/2018)',
        '{"fonte": "LC estadual 388/2018 + LC 397/2018 + LC 426/2020", "regioes": 12, "municipios": 185}');

COMMIT;
